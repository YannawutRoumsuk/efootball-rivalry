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

const save = (players: unknown[]) =>
  rpc<{ id: string }>(bob, `select public.save_squad_match($1, null, $2, $3, '{}') as id`, [rivalryId, JSON.stringify({ team_name: "BVB" }), JSON.stringify(players)]);

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

describe("3v3 awards and negative evaluation points", () => {
  it("stores titles and negative points", async () => {
    const awards = [{ title: "The Architect", tier: "gold" }, { title: "Maestro", tier: "silver" }];
    const [{ id }] = await save([
      { slot: 1, player_id: owner, stats: { dribbling: -23, total_points: 933 }, awards },
      { slot: 2, player_id: bob, stats: { dribbling: 81 } },
    ]);
    const rows = await rpc<{ slot: number; stats: Record<string, number>; awards: unknown }>(owner, `select slot, stats, awards from public.squad_match_players where squad_match_id = $1 order by slot`, [id]);
    expect(rows[0]).toEqual({ slot: 1, stats: { dribbling: -23, total_points: 933 }, awards });
    expect(rows[1].awards).toEqual([]);
  });

  it("rejects malformed titles", async () => {
    const bad = (awards: unknown) => save([{ slot: 1, player_id: owner, stats: {}, awards }, { slot: 2, player_id: bob, stats: {} }]);
    await expect(bad([{ title: "X", tier: "platinum" }])).rejects.toThrow();
    await expect(bad([{ title: "", tier: "gold" }])).rejects.toThrow();
    await expect(bad([{ title: "X", tier: "gold", extra: 1 }])).rejects.toThrow();
    await expect(t.db.query("select public.squad_valid_awards($1::jsonb) as ok", [JSON.stringify({ title: "X" })])).resolves.toMatchObject({ rows: [{ ok: false }] });
    await expect(t.db.query("select public.squad_valid_awards($1::jsonb) as ok", [JSON.stringify(["x", 1])])).resolves.toMatchObject({ rows: [{ ok: false }] });
    await expect(bad(Array.from({ length: 7 }, () => ({ title: "X", tier: "gold" })))).rejects.toThrow();
    // A non-array is treated as no titles rather than an error.
    await expect(bad("nope")).resolves.toHaveLength(1);
  });
});
