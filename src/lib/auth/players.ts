import "server-only";

import { sql } from "@/lib/db";

export interface Seat {
  key: "a" | "b";
  id: string;
  name: string;
}

const PLACEHOLDER_HASH = "!pin-login";

/**
 * Guarantees exactly one rivalry with two player seats. Reuses whatever exists
 * (e.g. accounts created before PIN login) and only fills the gaps, so history
 * is never lost. Serialised with an advisory lock.
 */
export async function ensureSeats(): Promise<Seat[]> {
  return sql().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(4207012)`;

    const newSeatUser = async (slot: "a" | "b") => {
      const name = (slot === "a" ? process.env.PLAYER_A_NAME : process.env.PLAYER_B_NAME)?.trim() || `Player ${slot.toUpperCase()}`;
      const [user] = await tx<Array<{ id: string }>>`
        insert into auth.users (email, password_hash, raw_user_meta_data)
        values (${`player-${slot}-${crypto.randomUUID().slice(0, 8)}@seat.local`}, ${PLACEHOLDER_HASH}, ${tx.json({ display_name: name.slice(0, 40) })})
        returning id`;
      return user.id;
    };

    let [rivalry] = await tx<Array<{ id: string }>>`select id from public.rivalries order by created_at limit 1`;
    if (!rivalry) {
      const owner = await newSeatUser("a");
      [rivalry] = await tx<Array<{ id: string }>>`
        insert into public.rivalries (name, created_by) values ('Rivalry', ${owner}) returning id`;
      await tx`insert into public.rivalry_members (rivalry_id, user_id, role) values (${rivalry.id}, ${owner}, 'owner')`;
    }

    const count = async () =>
      (await tx<Array<{ n: number }>>`select count(*)::int as n from public.rivalry_members where rivalry_id = ${rivalry.id}`)[0].n;
    if ((await count()) === 0) {
      const owner = await newSeatUser("a");
      await tx`insert into public.rivalry_members (rivalry_id, user_id, role) values (${rivalry.id}, ${owner}, 'owner')`;
    }
    if ((await count()) === 1) {
      const second = await newSeatUser("b");
      await tx`insert into public.rivalry_members (rivalry_id, user_id, role) values (${rivalry.id}, ${second}, 'member')`;
    }

    const rows = await tx<Array<{ id: string; display_name: string }>>`
      select p.id, p.display_name
      from public.rivalry_members m join public.profiles p on p.id = m.user_id
      where m.rivalry_id = ${rivalry.id}
      order by (m.role = 'owner') desc, m.joined_at`;
    return rows.map((r, i) => ({ key: i === 0 ? "a" : "b", id: r.id, name: r.display_name }));
  }) as Promise<Seat[]>;
}
