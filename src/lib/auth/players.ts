import "server-only";

import { sql } from "@/lib/db";
import { getPlayerPins } from "@/lib/env";

export interface Seat {
  seat: number;
  id: string;
  name: string;
}

const PLACEHOLDER_HASH = "!pin-login";

/** Seat order everywhere: group owner first, then by join time. Keep in sync with session.ts. */
export const SEAT_ORDER_SQL = "(m.role = 'owner') desc, m.joined_at, m.user_id";

/**
 * Guarantees one group with a seat for every configured PLAYER_<n>_PIN.
 * Reuses whatever exists (earlier accounts and their history) and only adds
 * missing seats. Serialised with an advisory lock.
 */
export async function ensureSeats(): Promise<Seat[]> {
  const wanted = Math.max(2, ...getPlayerPins().pins.map((p) => p.seat));

  return sql().begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(4207012)`;

    const newSeatUser = async (seat: number) => {
      const name = process.env[`PLAYER_${seat}_NAME`]?.trim() || `Player ${seat}`;
      const [user] = await tx<Array<{ id: string }>>`
        insert into auth.users (email, password_hash, raw_user_meta_data)
        values (${`player-${seat}-${crypto.randomUUID().slice(0, 8)}@seat.local`}, ${PLACEHOLDER_HASH}, ${tx.json({ display_name: name.slice(0, 40) })})
        returning id`;
      return user.id;
    };

    let [group] = await tx<Array<{ id: string }>>`select id from public.rivalries order by created_at limit 1`;
    if (!group) {
      const owner = await newSeatUser(1);
      [group] = await tx<Array<{ id: string }>>`
        insert into public.rivalries (name, created_by) values ('Rivalry', ${owner}) returning id`;
      await tx`insert into public.rivalry_members (rivalry_id, user_id, role) values (${group.id}, ${owner}, 'owner')`;
    }

    const count = async () =>
      (await tx<Array<{ n: number }>>`select count(*)::int as n from public.rivalry_members where rivalry_id = ${group.id}`)[0].n;
    for (let n = await count(); n < wanted; n = await count()) {
      const id = await newSeatUser(n + 1);
      await tx`insert into public.rivalry_members (rivalry_id, user_id, role)
               values (${group.id}, ${id}, ${n === 0 ? "owner" : "member"})`;
    }

    const rows = await tx<Array<{ id: string; display_name: string }>>`
      select p.id, p.display_name
      from public.rivalry_members m join public.profiles p on p.id = m.user_id
      where m.rivalry_id = ${group.id}
      order by ${tx.unsafe(SEAT_ORDER_SQL)}`;
    return rows.map((r, i) => ({ seat: i + 1, id: r.id, name: r.display_name }));
  }) as Promise<Seat[]>;
}
