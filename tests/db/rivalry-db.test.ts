import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

function sides(left: string, right: string, lg: number, rg: number, extra: Record<string, unknown> = {}) {
  return JSON.stringify([
    { player_id: left, screen_side: "left", goals: lg, shots: 10, shots_on_target: 5, ...extra },
    { player_id: right, screen_side: "right", goals: rg, shots: 8, shots_on_target: 3 },
  ]);
}

let t: TestDb;
let alice: string;
let bob: string;
let carol: string;
let mallory: string;
let rivalryId: string;

async function rpc<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  return t.asUser(user, async (db) => (await db.query<T>(sql, params)).rows);
}

beforeAll(async () => {
  t = await createTestDb();
  alice = await t.createUser("alice@example.com", "Alice");
  bob = await t.createUser("bob@example.com", "Bob");
  carol = await t.createUser("carol@example.com", "Carol");
  mallory = await t.createUser("mallory@example.com", "Mallory");

  [{ create_rivalry: rivalryId }] = await rpc<{ create_rivalry: string }>(alice, `select public.create_rivalry('Alice vs Bob')`);
  await rpc(alice, `select public.create_rivalry_invite($1, 24)`, [hash("CODE-BOB")]);
  await rpc(bob, `select public.accept_rivalry_invite($1)`, [hash("CODE-BOB")]);
});

afterAll(async () => {
  await t?.close();
});

describe("rivalry membership", () => {
  it("starts with the two founding members", async () => {
    const rows = await rpc<{ user_id: string; role: string }>(alice, `select user_id, role from rivalry_members order by joined_at`);
    expect(rows).toEqual([
      { user_id: alice, role: "owner" },
      { user_id: bob, role: "member" },
    ]);
  });

  it("(12) allows a third player but never a fourth", async () => {
    const cara = await t.createUser("cara@example.com", "Cara");
    const dave = await t.createUser("dave@example.com", "Dave");
    // Third seat: allowed.
    await rpc(alice, `select public.create_rivalry_invite($1, 24)`, [hash("CODE-CARA")]);
    await rpc(cara, `select public.accept_rivalry_invite($1)`, [hash("CODE-CARA")]);
    const [{ n }] = await rpc<{ n: number }>(alice, `select count(*)::int as n from rivalry_members`);
    expect(n).toBe(3);

    // Inviting is blocked once the group is full…
    await expect(rpc(alice, `select public.create_rivalry_invite($1, 24)`, [hash("X")])).rejects.toThrow(/RIVALRY_FULL/);
    // …an invite created earlier cannot add a fourth member…
    await t.db.query(
      `insert into rivalry_invites (rivalry_id, token_hash, created_by, expires_at) values ($1, $2, $3, now() + interval '1 day')`,
      [rivalryId, hash("LEAKED"), alice],
    );
    await expect(rpc(dave, `select public.accept_rivalry_invite($1)`, [hash("LEAKED")])).rejects.toThrow(/RIVALRY_FULL/);
    // …and the trigger enforces it even for a privileged direct insert.
    await expect(
      t.db.query(`insert into rivalry_members (rivalry_id, user_id, role) values ($1, $2, 'member')`, [rivalryId, dave]),
    ).rejects.toThrow(/RIVALRY_FULL/);

    // Any two members can play each other; a non-member still can't appear in a match.
    const [created] = await rpc<{ match_no: number }>(cara, `select * from public.create_match($1, $2::jsonb)`, [rivalryId, sides(cara, bob, 1, 1)]);
    expect(created.match_no).toBeGreaterThan(0);
    await expect(
      rpc(alice, `select * from public.create_match($1, $2::jsonb)`, [rivalryId, sides(alice, dave, 1, 0)]),
    ).rejects.toThrow(/PLAYER_NOT_IN_RIVALRY/);
  });

  it("rejects reused and expired invites", async () => {
    const [{ create_rivalry: other }] = await rpc<{ create_rivalry: string }>(carol, `select public.create_rivalry('Carol room')`);
    await rpc(carol, `select public.create_rivalry_invite($1, 1)`, [hash("OLD")]);
    await t.db.query(`update rivalry_invites set expires_at = now() - interval '1 minute' where token_hash = $1`, [hash("OLD")]);
    await expect(rpc(mallory, `select public.accept_rivalry_invite($1)`, [hash("OLD")])).rejects.toThrow(/INVITE_EXPIRED/);
    await expect(rpc(mallory, `select public.accept_rivalry_invite($1)`, [hash("NOPE")])).rejects.toThrow(/INVITE_INVALID/);
    expect(other).toBeTruthy();
    // Leave again so Carol can act as an outsider below.
    await rpc(carol, `select public.leave_rivalry()`);
  });
});

describe("(11) unauthorized access", () => {
  it("outsiders cannot read another rivalry's rows", async () => {
    await rpc(alice, `select * from public.create_match($1, $2::jsonb)`, [rivalryId, sides(alice, bob, 2, 1)]);
    for (const table of ["rivalries", "rivalry_members", "matches", "match_sides", "match_events", "rivalry_invites"]) {
      const rows = await rpc(mallory, `select * from public.${table}`);
      expect(rows, table).toHaveLength(0);
    }
    const profiles = await rpc<{ id: string }>(mallory, `select id from public.profiles`);
    expect(profiles.map((p) => p.id)).toEqual([mallory]);
  });

  it("outsiders cannot write via RPCs or directly", async () => {
    await expect(
      rpc(mallory, `select * from public.create_match($1, $2::jsonb)`, [rivalryId, sides(alice, bob, 5, 0)]),
    ).rejects.toThrow(/FORBIDDEN/);
    const [{ id }] = await rpc<{ id: string }>(alice, `select id from matches limit 1`);
    await expect(rpc(mallory, `select public.set_match_status($1, 'void', 'hijack')`, [id])).rejects.toThrow(/MATCH_NOT_FOUND/);
    await expect(rpc(mallory, `update public.matches set status = 'void'`)).rejects.toThrow(/permission denied/);
    await expect(rpc(alice, `delete from public.matches`)).rejects.toThrow(/permission denied/);
    await expect(
      rpc(mallory, `insert into public.match_uploads (rivalry_id, uploaded_by, storage_path, image_hash, mime_type, size_bytes) values ($1, $2, 'x/y.png', $3, 'image/png', 10)`, [rivalryId, mallory, hash("img")]),
    ).rejects.toThrow(/row-level security/);
  });

  it("anonymous callers cannot execute RPCs", async () => {
    await t.db.exec(`set role anon`);
    try {
      await expect(t.db.query(`select public.create_rivalry('x')`)).rejects.toThrow(/permission denied/);
    } finally {
      await t.db.exec(`reset role`);
    }
  });

  it("members cannot attribute a match to a non-member", async () => {
    await expect(
      rpc(alice, `select * from public.create_match($1, $2::jsonb)`, [rivalryId, sides(alice, mallory, 1, 0)]),
    ).rejects.toThrow(/PLAYER_NOT_IN_RIVALRY/);
  });
});

describe("(13) match transaction rollback", () => {
  it("saves nothing when any part of the match is invalid", async () => {
    const count = async () => (await t.db.query<{ n: number }>(`select count(*)::int n from matches`)).rows[0].n;
    const before = await count();

    // Second side violates shots_on_target <= shots after the match row is inserted.
    const bad = JSON.stringify([
      { player_id: alice, screen_side: "left", goals: 1 },
      { player_id: bob, screen_side: "right", goals: 0, shots: 1, shots_on_target: 4 },
    ]);
    await expect(rpc(alice, `select * from public.create_match($1, $2::jsonb)`, [rivalryId, bad])).rejects.toThrow();

    // Unknown upload id fails after match + sides were inserted.
    await expect(
      rpc(alice, `select * from public.create_match($1, $2::jsonb, null, $3)`, [
        rivalryId,
        sides(alice, bob, 3, 0),
        "99999999-9999-4999-8999-999999999999",
      ]),
    ).rejects.toThrow(/UPLOAD_NOT_AVAILABLE/);

    expect(await count()).toBe(before);
    const orphans = await t.db.query(`select * from match_sides s where not exists (select 1 from matches m where m.id = s.match_id)`);
    expect(orphans.rows).toHaveLength(0);
  });

  it("requires exactly one left and one right side", async () => {
    const same = JSON.stringify([
      { player_id: alice, screen_side: "left", goals: 1 },
      { player_id: bob, screen_side: "left", goals: 0 },
    ]);
    await expect(rpc(alice, `select * from public.create_match($1, $2::jsonb)`, [rivalryId, same])).rejects.toThrow(/INVALID_SIDES/);
  });

  it("a match can never be left with a single side", async () => {
    const [{ id }] = await t.db.query<{ id: string }>(`select id from matches limit 1`).then((r) => r.rows);
    await expect(
      t.db.transaction(async (tx) => {
        await tx.query(`delete from match_sides where match_id = $1 and screen_side = 'right'`, [id]);
      }),
    ).rejects.toThrow(/MATCH_REQUIRES_TWO_SIDES/);
  });
});

describe("(14) historical match ordering", () => {
  it("appends, inserts at a position and reorders without gaps", async () => {
    const order = async () =>
      (await rpc<{ match_no: number; goals: number }>(
        alice,
        `select m.match_no, s.goals from matches m join match_sides s on s.match_id = m.id and s.player_id = $1 order by m.match_no`,
        [alice],
      )).map((r) => `${r.match_no}:${r.goals}`);

    await rpc(alice, `select * from public.create_match($1, $2::jsonb)`, [rivalryId, sides(alice, bob, 7, 0)]);
    // Historical import: insert before everything else.
    const [inserted] = await rpc<{ match_id: string; match_no: number }>(
      bob,
      `select * from public.create_match($1, $2::jsonb, '2025-01-01T12:00:00Z', null, 1)`,
      [rivalryId, sides(bob, alice, 4, 9)],
    );
    expect(inserted.match_no).toBe(1);
    // (#2 is the Cara–Bob match from the three-player test; Alice isn't in it.)
    expect(await order()).toEqual(["1:9", "3:2", "4:7"]);

    await rpc(alice, `select public.move_match($1, 4)`, [inserted.match_id]);
    expect(await order()).toEqual(["2:2", "3:7", "4:9"]);

    const events = await rpc<{ event_type: string }>(alice, `select event_type from match_events where match_id = $1 order by created_at`, [inserted.match_id]);
    expect(events.map((e) => e.event_type)).toEqual(["created", "reordered"]);
  });
});

describe("disputes, voids and audit trail", () => {
  it("logs every status change and edit, and voids instead of deleting", async () => {
    const [{ match_id }] = await rpc<{ match_id: string }>(alice, `select * from public.create_match($1, $2::jsonb)`, [
      rivalryId,
      sides(alice, bob, 1, 1),
    ]);
    await expect(rpc(bob, `select public.set_match_status($1, 'dispute', null)`, [match_id])).rejects.toThrow(/NOTE_REQUIRED/);
    await rpc(bob, `select public.set_match_status($1, 'dispute', 'Score was 1-2')`, [match_id]);
    await rpc(bob, `select public.update_match($1, $2::jsonb, null, 'fixed score')`, [match_id, sides(alice, bob, 1, 2)]);
    await rpc(alice, `select public.set_match_status($1, 'resolve', null)`, [match_id]);
    await rpc(alice, `select public.set_match_status($1, 'void', 'test match')`, [match_id]);

    const [m] = await rpc<{ status: string }>(alice, `select status from matches where id = $1`, [match_id]);
    expect(m.status).toBe("void");
    await expect(rpc(alice, `select public.update_match($1, $2::jsonb)`, [match_id, sides(alice, bob, 0, 0)])).rejects.toThrow(/MATCH_VOID/);

    const events = await rpc<{ event_type: string; before_data: { sides?: Array<{ goals: number }> } | null }>(
      alice,
      `select event_type, before_data from match_events where match_id = $1 order by created_at`,
      [match_id],
    );
    expect(events.map((e) => e.event_type)).toEqual(["created", "disputed", "updated", "resolved", "voided"]);
    expect(events[2].before_data?.sides?.map((s) => s.goals)).toEqual([1, 1]);
  });

  it("refuses to leave a rivalry that has matches", async () => {
    await expect(rpc(bob, `select public.leave_rivalry()`)).rejects.toThrow(/RIVALRY_HAS_MATCHES/);
  });
});

describe("rate limiting", () => {
  it("blocks after the limit within the window", async () => {
    const call = async () =>
      (await rpc<{ ok: boolean }>(alice, `select public.consume_rate_limit('ai_extract', 2, 60) as ok`))[0].ok;
    expect(await call()).toBe(true);
    expect(await call()).toBe(true);
    expect(await call()).toBe(false);
  });
});
