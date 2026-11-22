import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

let t: TestDb;
let owner: string;
let bob: string;
let carol: string;
let mallory: string;
let rivalryId: string;

async function rpc<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  return t.asUser(user, async (db) => (await db.query<T>(sql, params)).rows);
}

const players = (a: string | null, b: string | null, c: string | null) =>
  JSON.stringify([
    { slot: 1, player_id: a, ingame_name: "WyNM", stats: { total_points: 4615, goals: 0, shots: 1 } },
    { slot: 2, player_id: b, ingame_name: "Do3minicT0rett0", stats: { total_points: 4288, goals: 1, shots: null } },
    { slot: 3, player_id: c, ingame_name: "bigverx", stats: { total_points: 2910, goals: 2 } },
  ]);

const save = (user: string, list: string, matchId: string | null = null, uploads: string[] = []) =>
  rpc<{ id: string }>(user, `select public.save_squad_match($1, $2, $3, $4, $5) as id`, [
    rivalryId,
    matchId,
    JSON.stringify({ team_name: "BVB", goals_for: 3, goals_against: 0, played_at: "2026-11-22T08:00:00Z" }),
    list,
    uploads,
  ]);

beforeAll(async () => {
  t = await createTestDb();
  owner = await t.createUser("owner@example.com", "M");
  bob = await t.createUser("bob@example.com", "DOM");
  carol = await t.createUser("carol@example.com", "Big");
  mallory = await t.createUser("mallory@example.com", "Mallory");
  [{ create_rivalry: rivalryId }] = await rpc<{ create_rivalry: string }>(owner, `select public.create_rivalry('Squad')`);
  for (const [user, code] of [[bob, "B"], [carol, "C"]] as const) {
    await rpc(owner, `select public.create_rivalry_invite($1, 24)`, [hash(code)]);
    await rpc(user, `select public.accept_rivalry_invite($1)`, [hash(code)]);
  }
});

afterAll(async () => {
  await t?.close();
});

describe("squad matches", () => {
  it("a member saves a match with three columns and the in-game names are learned", async () => {
    const [{ id }] = await save(bob, players(owner, bob, carol));
    const rows = await rpc<{ slot: number; player_id: string; stats: Record<string, number | null> }>(
      carol,
      `select slot, player_id, stats from public.squad_match_players where squad_match_id = $1 order by slot`,
      [id],
    );
    expect(rows.map((r) => r.player_id)).toEqual([owner, bob, carol]);
    expect(rows[1].stats).toEqual({ total_points: 4288, goals: 1, shots: null });
    const aliases = await rpc<{ name_key: string; player_id: string }>(owner, `select name_key, player_id from public.squad_aliases order by name_key`);
    expect(aliases).toEqual([
      { name_key: "b1gverx", player_id: carol },
      { name_key: "d03m1n1ct0rett0", player_id: bob },
      { name_key: "wynm", player_id: owner },
    ]);
  });

  it("a stranger can fill the third column, but two members are required", async () => {
    await expect(save(bob, players(owner, bob, null))).resolves.toHaveLength(1);
    await expect(save(bob, players(owner, null, null))).rejects.toThrow(/INVALID_SQUAD/);
  });

  it("rejects the same player twice, outsiders, and bad stat values", async () => {
    await expect(save(bob, players(owner, owner, carol))).rejects.toThrow();
    await expect(save(bob, players(owner, bob, mallory))).rejects.toThrow(/PLAYER_NOT_IN_RIVALRY/);
    const bad = JSON.stringify([
      { slot: 1, player_id: owner, stats: { goals: -1 } },
      { slot: 2, player_id: bob, stats: {} },
    ]);
    await expect(save(bob, bad)).rejects.toThrow();
    const text = JSON.stringify([
      { slot: 1, player_id: owner, stats: { goals: "7" } },
      { slot: 2, player_id: bob, stats: {} },
    ]);
    await expect(save(bob, text)).rejects.toThrow();
  });

  it("only the owner edits or deletes a saved match; outsiders see nothing", async () => {
    const [{ id }] = await save(bob, players(owner, bob, carol));
    await expect(save(bob, players(carol, bob, owner), id)).rejects.toThrow(/OWNER_ONLY/);
    await save(owner, players(carol, bob, owner), id);
    const [{ player_id }] = await rpc<{ player_id: string }>(bob, `select player_id from public.squad_match_players where squad_match_id = $1 and slot = 1`, [id]);
    expect(player_id).toBe(carol);
    // The owner re-pointed WyNM, so the alias follows.
    const [alias] = await rpc<{ player_id: string }>(owner, `select player_id from public.squad_aliases where name_key = 'wynm'`);
    expect(alias.player_id).toBe(carol);

    expect(await rpc(mallory, `select * from public.squad_matches`)).toEqual([]);
    expect(await rpc(mallory, `select * from public.squad_match_players`)).toEqual([]);
    await expect(rpc(mallory, `select public.delete_squad_match($1)`, [id])).rejects.toThrow(/MATCH_NOT_FOUND/);
    await expect(rpc(bob, `select public.delete_squad_match($1)`, [id])).rejects.toThrow(/OWNER_ONLY/);
    await rpc(owner, `select public.delete_squad_match($1)`, [id]);
    expect(await rpc(bob, `select * from public.squad_matches where id = $1`, [id])).toEqual([]);
  });

  it("members can't write the tables directly", async () => {
    await expect(rpc(bob, `insert into public.squad_matches (rivalry_id, created_by) values ($1, $2)`, [rivalryId, bob])).rejects.toThrow();
    await expect(rpc(bob, `update public.squad_match_players set stats = '{}'`)).rejects.toThrow();
    await expect(rpc(bob, `delete from public.squad_aliases`)).rejects.toThrow();
  });

  it("uploads attach to the saved match; aliases are owner-managed", async () => {
    const [{ id: uploadId }] = await rpc<{ id: string }>(
      bob,
      `insert into public.squad_uploads (rivalry_id, uploaded_by, storage_path, image_hash, mime_type, size_bytes)
       values ($1, $2, $3, $4, 'image/webp', 100) returning id`,
      [rivalryId, bob, `${rivalryId}/00000000-0000-0000-0000-000000000001.webp`, hash("img")],
    );
    const [{ id }] = await save(bob, players(owner, bob, carol), null, [uploadId]);
    const [up] = await rpc<{ squad_match_id: string }>(bob, `select squad_match_id from public.squad_uploads where id = $1`, [uploadId]);
    expect(up.squad_match_id).toBe(id);

    await expect(rpc(bob, `select public.set_squad_alias($1, 'Stranger', $2)`, [rivalryId, bob])).rejects.toThrow(/OWNER_ONLY/);
    await rpc(owner, `select public.set_squad_alias($1, 'Stranger', $2)`, [rivalryId, bob]);
    await rpc(owner, `select public.set_squad_alias($1, 'Stranger', null)`, [rivalryId]);
    expect(await rpc(owner, `select * from public.squad_aliases where name_key = 'stranger'`)).toEqual([]);
  });
});
