/**
 * Integration tests against a REAL PostgreSQL server using the app's own data
 * layer (withUser → SET ROLE authenticated + RLS) and realtime hub.
 *
 *   node scripts/local-db.mjs        # in another terminal
 *   TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/rivalry_test npm run test:e2e
 *
 * Skipped when TEST_DATABASE_URL is not set. Migrations must already be applied.
 */
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

describe.skipIf(!url)("real PostgreSQL", async () => {
  const { sql, withUser } = await import("@/lib/db");
  const { subscribe } = await import("@/lib/server/realtime");

  async function createUser(name: string): Promise<string> {
    const [row] = await sql()<Array<{ id: string }>>`
      insert into auth.users (email, password_hash, raw_user_meta_data)
      values (${`it-${name.toLowerCase()}-${randomUUID().slice(0, 8)}@example.com`}, 'x', ${sql().json({ display_name: name })})
      returning id`;
    return row.id;
  }

  const sides = (left: string, right: string, lg: number, rg: number) =>
    sql().json([
      { player_id: left, screen_side: "left", goals: lg },
      { player_id: right, screen_side: "right", goals: rg },
    ]);

  const createMatch = (user: string, rivalry: string, s: ReturnType<typeof sides>) =>
    withUser(user, (tx) => tx<Array<{ match_id: string; match_no: number }>>`
      select * from public.create_match(${rivalry}::uuid, ${s}::jsonb, null::timestamptz, null::uuid, null::int)`);

  let alice: string;
  let bob: string;
  let rivalry: string;

  beforeAll(async () => {
    alice = await createUser("Alice");
    bob = await createUser("Bob");
    [{ id: rivalry }] = await withUser(alice, (tx) => tx<Array<{ id: string }>>`select public.create_rivalry('IT room') as id`);
    const code = randomUUID();
    await withUser(alice, (tx) => tx`select public.create_rivalry_invite(${hash(code)}::text, 1)`);
    await withUser(bob, (tx) => tx`select public.accept_rivalry_invite(${hash(code)}::text)`);
  });

  afterAll(async () => {
    await sql()`delete from public.rivalries where id = ${rivalry}`;
    await sql().end({ timeout: 5 });
  });

  it("(12) concurrent joins: exactly one of two racing users gets the last seat", async () => {
    const owner = await createUser("Owner");
    const [{ id: room }] = await withUser(owner, (tx) => tx<Array<{ id: string }>>`select public.create_rivalry('Race') as id`);
    // Fill the second seat so only one seat (the third) is left to race for.
    const second = await createUser("Second");
    const secondCode = randomUUID();
    await withUser(owner, (tx) => tx`select public.create_rivalry_invite(${hash(secondCode)}::text, 1)`);
    await withUser(second, (tx) => tx`select public.accept_rivalry_invite(${hash(secondCode)}::text)`);
    // Two valid invites for the same room, redeemed at the same moment.
    const codes = [randomUUID(), randomUUID()];
    for (const c of codes) {
      await sql()`insert into public.rivalry_invites (rivalry_id, token_hash, created_by, expires_at)
                  values (${room}, ${hash(c)}, ${owner}, now() + interval '1 hour')`;
    }
    const [x, y] = [await createUser("X"), await createUser("Y")];
    const results = await Promise.allSettled([
      withUser(x, (tx) => tx`select public.accept_rivalry_invite(${hash(codes[0])}::text)`),
      withUser(y, (tx) => tx`select public.accept_rivalry_invite(${hash(codes[1])}::text)`),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/RIVALRY_FULL/);
    const [{ n }] = await sql()<Array<{ n: number }>>`select count(*)::int as n from public.rivalry_members where rivalry_id = ${room}`;
    expect(n).toBe(3);
    await sql()`delete from public.rivalries where id = ${room}`;
  });

  it("concurrent saves get unique, gap-free match numbers", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => createMatch(i % 2 ? alice : bob, rivalry, sides(alice, bob, i, 0))),
    );
    const numbers = results.map((r) => r[0].match_no).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("(11) RLS through withUser: outsiders see nothing and cannot write", async () => {
    const mallory = await createUser("Mallory");
    const rows = await withUser(mallory, (tx) => tx`select id from public.matches where rivalry_id = ${rivalry}`);
    expect(rows).toHaveLength(0);
    await expect(createMatch(mallory, rivalry, sides(alice, bob, 9, 0))).rejects.toThrow(/FORBIDDEN/);
    await expect(withUser(mallory, (tx) => tx`select * from auth.users`)).rejects.toThrow(/permission denied/);
    await expect(withUser(alice, (tx) => tx`select * from auth.sessions`)).rejects.toThrow(/permission denied/);
    await expect(withUser(alice, (tx) => tx`delete from public.matches`)).rejects.toThrow(/permission denied/);
  });

  it("(13) a failed save rolls back completely", async () => {
    const [{ n: before }] = await sql()<Array<{ n: number }>>`select count(*)::int as n from public.matches where rivalry_id = ${rivalry}`;
    await expect(
      withUser(alice, (tx) => tx`
        select * from public.create_match(${rivalry}::uuid, ${sides(alice, bob, 1, 0)}::jsonb, null::timestamptz, ${randomUUID()}::uuid, null::int)`),
    ).rejects.toThrow(/UPLOAD_NOT_AVAILABLE/);
    const [{ n: after }] = await sql()<Array<{ n: number }>>`select count(*)::int as n from public.matches where rivalry_id = ${rivalry}`;
    expect(after).toBe(before);
  });

  it("(15) realtime: a save by Alice reaches Bob's subscription, and only that rivalry's", async () => {
    const otherRoom = randomUUID();
    const strayEvents: unknown[] = [];
    const stopStray = await subscribe(otherRoom, (e) => strayEvents.push(e));

    const received = new Promise<{ match_id: string; op: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no realtime event within 5s")), 5000);
      void subscribe(rivalry, (event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });
    const [created] = await createMatch(alice, rivalry, sides(bob, alice, 0, 4));
    const event = await received;
    expect(event).toMatchObject({ match_id: created.match_id, op: "INSERT" });
    expect(strayEvents).toHaveLength(0);
    stopStray();
  });

  it("PIN seats: keeps existing players, adds a third seat once, idempotently", async () => {
    const { ensureSeats } = await import("@/lib/auth/players");
    const [{ id: oldest }] = await sql()<Array<{ id: string }>>`select id from public.rivalries order by created_at limit 1`;
    const before = await sql()<Array<{ user_id: string }>>`
      select user_id from public.rivalry_members where rivalry_id = ${oldest} order by (role = 'owner') desc, joined_at`;

    Object.assign(process.env, { PLAYER_1_PIN: "1111", PLAYER_2_PIN: "2222", PLAYER_3_PIN: "3333", PLAYER_3_NAME: "เพื่อนคนที่สาม" });
    try {
      const first = await ensureSeats();
      const second = await ensureSeats();
      expect(first.map((s) => s.seat)).toEqual([1, 2, 3]);
      expect(second.map((s) => s.id)).toEqual(first.map((s) => s.id));
      // Existing players keep their seats (and therefore their history).
      expect(first.slice(0, before.length).map((s) => s.id)).toEqual(before.map((r) => r.user_id));
      expect(first[2].name).toBe(before.length < 3 ? "เพื่อนคนที่สาม" : first[2].name);
    } finally {
      for (const k of ["PLAYER_1_PIN", "PLAYER_2_PIN", "PLAYER_3_PIN", "PLAYER_3_NAME"]) delete process.env[k];
    }
  });

  it("stores Thai names and labels intact (UTF-8 end to end)", async () => {
    const thai = await createUser("เพื่อนซี้");
    const [p] = await withUser(thai, (tx) => tx<Array<{ display_name: string }>>`select display_name from public.profiles where id = ${thai}`);
    expect(p.display_name).toBe("เพื่อนซี้");
  });

});
