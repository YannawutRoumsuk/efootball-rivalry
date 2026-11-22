import { describe, expect, it } from "vitest";
import {
  categorySum,
  defaultAliases,
  foldText,
  matchAlias,
  matchRowLabel,
  mergeScreenReads,
  mvpOf,
  parseCell,
  squadOutcome,
  squadTimeline,
  summarizeSquadPlayer,
  teamGoals,
  validateSquadColumns,
  type SquadMatch,
} from "@/lib/domain/squad";
import { squadMatchSchema } from "@/lib/domain/squad-schema";
import { compareModes } from "@/lib/domain/squad-compare";

describe("reading cells and labels", () => {
  it("parses the three cell formats and rejects anything else", () => {
    expect(parseCell("29 (16)", "pair")).toEqual([29, 16]);
    expect(parseCell("29(16)", "pair")).toEqual([29, 16]);
    expect(parseCell("29", "pair")).toBeNull();
    expect(parseCell("61%", "pct")).toEqual([61]);
    expect(parseCell("61", "pct")).toEqual([61]);
    expect(parseCell("4615", "int")).toEqual([4615]);
    expect(parseCell("1(2)", "int")).toBeNull();
    expect(parseCell("", "int")).toBeNull();
  });

  it("recognises row labels despite OCR slips and ignores non-rows", () => {
    expect(matchRowLabel("Runs Qut Wide")?.keys).toEqual(["runs_out_wide"]);
    expect(matchRowLabel("Shots (On target)")?.keys).toEqual(["shots", "shots_on_target"]);
    expect(matchRowLabel("Double-Marks")?.keys).toEqual(["double_marks"]);
    expect(matchRowLabel("Passes (Successful)")?.keys).toEqual(["passes", "successful_passes"]);
    expect(matchRowLabel("Passes Obstructed")?.keys).toEqual(["passes_obstructed"]);
    expect(matchRowLabel("Evaluation Graph")).toBeNull();
    expect(matchRowLabel("Details")).toBeNull();
  });

  it("matches in-game names with O/0 and l/1 confusion", () => {
    const aliases = [{ name: "Do3minicT0rett0", playerId: "dom" }, { name: "WyNM", playerId: "m" }];
    expect(foldText("Do3minicTOrett0")).toBe(foldText("Do3minicT0rett0"));
    expect(matchAlias("Do3minicTOrett0", aliases)?.playerId).toBe("dom");
    expect(matchAlias("Do3minicTorettO", aliases)?.playerId).toBe("dom");
    expect(matchAlias("WyNM", aliases)?.playerId).toBe("m");
    expect(matchAlias("WyNN", aliases)?.playerId).toBe("m");
    expect(matchAlias("bigverx", aliases)).toBeNull();
    expect(matchAlias(null, aliases)).toBeNull();
  });

  it("maps the built-in names to roster players by display name", () => {
    const roster = [{ id: "1", display_name: "M" }, { id: "2", display_name: "DOM" }, { id: "3", display_name: "Big" }];
    expect(defaultAliases(roster)).toEqual([
      { name: "WyNM", playerId: "1" },
      { name: "Do3minicT0rett0", playerId: "2" },
      { name: "bigverx", playerId: "3" },
    ]);
    expect(defaultAliases([{ id: "x", display_name: "Somebody" }])).toEqual([]);
  });
});

describe("merging screenshots", () => {
  const aliases = [{ name: "WyNM", playerId: "m" }, { name: "bigverx", playerId: "big" }];
  const shotA = {
    names: ["WyNM", null, "bigverx"],
    team: "BVB",
    values: { offensive_positioning: [960, 591, 539], shooting: [370, 661, 308], total_points: [null, 4288, null] },
  };
  const shotB = {
    names: ["WyNM", "Do3minicTOrett0", "bigverx"],
    team: "BVB",
    values: { shooting: [370, 660, 308], dueling: [2177, 1921, 1327], defensive_positioning: [130, 375, 306], passing: [303, 265, 187], dribbling: [675, 475, 243], goals: [0, 1, null] },
  };

  it("keeps the first value, reports disagreements and fills blanks from later shots", () => {
    const d = mergeScreenReads([shotA, shotB], aliases);
    expect(d.team).toBe("BVB");
    expect(d.columns.map((c) => c.ingameName)).toEqual(["WyNM", "Do3minicTOrett0", "bigverx"]);
    expect(d.columns.map((c) => c.playerId)).toEqual(["m", null, "big"]);
    expect(d.columns[1].stats.shooting).toBe(661);
    expect(d.conflicts).toEqual([{ slot: 2, key: "shooting" }]);
    expect(d.columns[2].stats.goals).toBeNull();
    expect(d.missingRows).toContain("Players Marked");
  });

  it("derives Total Points from the six categories", () => {
    const d = mergeScreenReads([shotA, shotB], aliases);
    expect(d.columns.map((c) => c.stats.total_points)).toEqual([4615, 4288, 2910]);
    expect(categorySum({ shooting: 1 })).toBeNull();
  });

  it("never pre-selects one player for two columns", () => {
    const d = mergeScreenReads([{ names: ["WyNM", "WyNM", null], team: null, values: {} }], aliases);
    expect(d.columns.map((c) => c.playerId)).toEqual(["m", null, null]);
  });
});

describe("validation", () => {
  it("needs two different members and sane numbers", () => {
    const ok = [
      { slot: 1 as const, playerId: "a", stats: { shots: 2, shots_on_target: 1, goals: 1 } },
      { slot: 2 as const, playerId: "b", stats: {} },
      { slot: 3 as const, playerId: null, stats: {} },
    ];
    expect(validateSquadColumns(ok)).toEqual([]);
    expect(validateSquadColumns([ok[0], ok[2]]).length).toBeGreaterThan(0);
    expect(validateSquadColumns([ok[0], { ...ok[1], playerId: "a" }]).length).toBeGreaterThan(0);
    expect(validateSquadColumns([{ ...ok[0], stats: { shots: 1, shots_on_target: 2 } }, ok[1]])).toEqual([
      { slot: 1, key: "shots_on_target", message: "Can't be more than its total." },
    ]);
    expect(validateSquadColumns([{ ...ok[0], stats: { good_positioning_pct: 101 } }, ok[1]])[0].key).toBe("good_positioning_pct");
  });

  it("the API schema rejects unknown stats and out-of-range values", () => {
    const base = {
      played_at: "2026-11-22T12:00:00.000Z",
      team_name: "BVB",
      goals_for: 3,
      goals_against: 0,
      players: [
        { slot: 1, player_id: "3f1a6c1e-8a51-4f1f-9a4b-2d6f3b7c9e01", ingame_name: "WyNM", stats: { goals: 0 } },
        { slot: 2, player_id: "3f1a6c1e-8a51-4f1f-9a4b-2d6f3b7c9e02", ingame_name: null, stats: {} },
      ],
    };
    expect(squadMatchSchema.safeParse(base).success).toBe(true);
    expect(squadMatchSchema.safeParse({ ...base, players: [{ ...base.players[0], stats: { hacks: 1 } }, base.players[1]] }).success).toBe(false);
    expect(squadMatchSchema.safeParse({ ...base, players: [{ ...base.players[0], stats: { goals: 51 } }, base.players[1]] }).success).toBe(false);
    expect(squadMatchSchema.safeParse({ ...base, players: [base.players[0], { ...base.players[1], slot: 1 }] }).success).toBe(false);
  });
});

describe("aggregates", () => {
  const m = (id: string, gf: number | null, ga: number | null, rows: Array<[string | null, number, number]>, at: string): SquadMatch => ({
    id,
    played_at: at,
    team_name: "BVB",
    opponent_name: null,
    goals_for: gf,
    goals_against: ga,
    team_stats: null,
    created_at: at,
    players: rows.map(([pid, points, goals], i) => ({
      slot: (i + 1) as 1 | 2 | 3,
      player_id: pid,
      ingame_name: null,
      stats: { total_points: points, goals, assists: 1, shots: 4, shots_on_target: 2, passes: 10, successful_passes: 8, intercepts: 3, tackles: 1 },
    })),
  });
  const matches = [
    m("1", 3, 0, [["m", 4615, 0], ["dom", 4288, 1], ["big", 2910, 2]], "2026-11-20T12:00:00Z"),
    m("2", 1, 2, [["m", 3000, 0], ["dom", 5000, 1], [null, 1000, 0]], "2026-11-21T12:00:00Z"),
    m("3", null, null, [["m", 2000, 0], ["big", 2000, 0]], "2026-11-22T12:00:00Z"),
  ];

  it("outcomes, team goals and MVP (ties give none)", () => {
    expect(matches.map(squadOutcome)).toEqual(["W", "L", null]);
    expect(teamGoals(matches[0].players)).toBe(3);
    expect(matches.map(mvpOf)).toEqual(["m", "dom", null]);
  });

  it("summarises a player across matches", () => {
    const s = summarizeSquadPlayer(matches, "m");
    expect(s).toMatchObject({ games: 3, wins: 1, losses: 1, draws: 0, mvps: 1, goalContributions: 3 });
    expect(s.stats.total_points.average).toBeCloseTo((4615 + 3000 + 2000) / 3);
    expect(s.shotAccuracy).toBe(50);
    expect(s.passCompletion).toBe(80);
    expect(summarizeSquadPlayer(matches, "nobody").games).toBe(0);
  });

  it("timeline is oldest first with nulls where a player sat out", () => {
    const tl = squadTimeline([...matches].reverse(), ["big"], "total_points");
    expect(tl.map((p) => p.values.big)).toEqual([2910, null, 2000]);
  });

  it("compares 1v1 and 3v3 lines per player", () => {
    const [c] = compareModes(["m"], [], [summarizeSquadPlayer(matches, "m")]);
    expect(c.v1.games).toBe(0);
    expect(c.v1.values.goals).toBeNull();
    expect(c.v3.values.interceptions).toBe(3);
    expect(c.v3.values.passCompletion).toBe(80);
  });
});
