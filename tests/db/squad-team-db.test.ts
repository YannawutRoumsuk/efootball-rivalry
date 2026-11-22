import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

let t: TestDb;
let owner: string;
let bob: string;
let rivalryId: string;

async function rpc<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  return t.asUser(user, async (db) => (await db.query<T>(sql, params)).rows);
}

const players = () => JSON.stringify([
  { slot: 1, player_id: owner, ingame_name: "WyNM", stats: { goals: 1 } },
  { slot: 2, player_id: bob, ingame_name: "Do3", stats: { goals: 2 } },
]);

const save = (user: string, match: Record<string, unknown>, uploads: string[] = []) =>
  rpc<{ id: string }>(user, `select public.save_squad_match($1, null, $2, $3, $4) as id`, [rivalryId, JSON.stringify(match), players(), uploads]);

beforeAll(async () => {
  t = await createTestDb();
  owner = await t.createUser("owner@example.com", "M");
  bob = await t.createUser("bob@example.com", "DOM");
  [{ create_rivalry: rivalryId }] = await rpc<{ create_rivalry: string }>(owner, `select public.create_rivalry('Squad')`);
  await rpc(owner, `select public.create_rivalry_invite($1, 24)`, [hash("B")]);
  await rpc(bob, `select public.accept_rivalry_invite($1)`, [hash("B")]);
});

afterAll(async () => {
  await t?.close();
});

describe("3v3 Full Time stats", () => {
  it("stores the score screen and the opponent's name", async () => {
    const team = { us: { possession_pct: 54, shots: 5, penalties: null }, them: { possession_pct: 46, shots: 4 } };
    const [{ id }] = await save(bob, { team_name: "BVB", opponent_name: "Rivals", goals_for: 3, goals_against: 0, team_stats: team });
    const [row] = await rpc<{ opponent_name: string; team_stats: unknown }>(owner, `select opponent_name, team_stats from public.squad_matches where id = $1`, [id]);
    expect(row).toEqual({ opponent_name: "Rivals", team_stats: team });
  });

  it("rejects malformed team stats", async () => {
    await expect(save(bob, { team_stats: { us: { shots: -1 }, them: {} } })).rejects.toThrow();
    await expect(save(bob, { team_stats: { us: {}, them: {}, extra: {} } })).rejects.toThrow();
    await expect(save(bob, { team_stats: { us: { shots: "5" }, them: {} } })).rejects.toThrow();
  });
});

describe("purge of unsaved uploads", () => {
  const upload = async (user: string, n: number) => {
    const [{ id }] = await rpc<{ id: string }>(
      user,
      `insert into public.squad_uploads (rivalry_id, uploaded_by, storage_path, image_hash, mime_type, size_bytes)
       values ($1, $2, $3, $4, 'image/webp', 100) returning id`,
      [rivalryId, user, `${rivalryId}/00000000-0000-0000-0000-00000000000${n}.webp`, hash(`img${n}`)],
    );
    return id;
  };

  it("removes only old uploads that were never saved, and members can't call it", async () => {
    const old = await upload(bob, 1);
    const fresh = await upload(bob, 2);
    const attached = await upload(bob, 3);
    await save(bob, { team_name: "X" }, [attached]);
    await t.db.query(`update public.squad_uploads set created_at = now() - interval '2 days' where id = any($1)`, [[old, attached]]);
    const [{ id: solo }] = (
      await t.db.query<{ id: string }>(
        `insert into public.match_uploads (rivalry_id, uploaded_by, storage_path, image_hash, mime_type, size_bytes, created_at)
         values ($1, $2, $3, $4, 'image/png', 100, now() - interval '3 days') returning id`,
        [rivalryId, bob, `${rivalryId}/00000000-0000-0000-0000-000000000009.png`, hash("solo")],
      )
    ).rows;

    await expect(rpc(bob, `select * from public.purge_stale_uploads(24)`)).rejects.toThrow();

    const { rows } = await t.db.query<{ storage_path: string }>(`select storage_path from public.purge_stale_uploads(24) order by 1`);
    expect(rows.map((r) => r.storage_path)).toEqual([
      `${rivalryId}/00000000-0000-0000-0000-000000000001.webp`,
      `${rivalryId}/00000000-0000-0000-0000-000000000009.png`,
    ]);
    const left = (await t.db.query<{ id: string }>(`select id from public.squad_uploads order by created_at`)).rows.map((r) => r.id);
    expect(left).toEqual(expect.arrayContaining([fresh, attached]));
    expect(left).not.toContain(old);
    expect((await t.db.query(`select 1 from public.match_uploads where id = $1`, [solo])).rows).toEqual([]);
  });
});
