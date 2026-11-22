import { describe, expect, it } from "vitest";
import {
  goalMargin,
  ourFullTimeSide,
  playerByOutcome,
  squadOutcome,
  teamStatsByOutcome,
  type SquadMatch,
  type TeamStats,
} from "@/lib/domain/squad";
import { squadMatchSchema } from "@/lib/domain/squad-schema";

const match = (id: string, gf: number | null, ga: number | null, team: TeamStats | null, points: Record<string, number>): SquadMatch => ({
  id,
  played_at: `2026-11-2${id}T12:00:00Z`,
  team_name: "BVB",
  opponent_name: "Opp",
  goals_for: gf,
  goals_against: ga,
  team_stats: team,
  created_at: `2026-11-2${id}T12:00:00Z`,
  players: Object.entries(points).map(([pid, tp], i) => ({
    slot: (i + 1) as 1 | 2 | 3,
    player_id: pid,
    ingame_name: null,
    stats: { total_points: tp, goals: tp > 4000 ? 1 : 0 },
  })),
});

describe("3v3 results", () => {
  it("decides the outcome from the score, then a shoot-out", () => {
    expect(squadOutcome({ goals_for: 3, goals_against: 0 })).toBe("W");
    expect(squadOutcome({ goals_for: 1, goals_against: 2 })).toBe("L");
    expect(squadOutcome({ goals_for: 1, goals_against: 1 })).toBe("D");
    expect(squadOutcome({ goals_for: 1, goals_against: 1, team_stats: { us: { penalties: 5 }, them: { penalties: 4 } } })).toBe("W");
    expect(squadOutcome({ goals_for: 1, goals_against: 1, team_stats: { us: { penalties: 3 }, them: { penalties: 4 } } })).toBe("L");
    expect(squadOutcome({ goals_for: null, goals_against: 0 })).toBeNull();
    expect(goalMargin({ goals_for: 0, goals_against: 3 })).toBe(-3);
  });

  it("finds our side of the Full Time screen by team name, then by our players' goals", () => {
    expect(ourFullTimeSide({ goals: 0, label: "Opponents FC" }, { goals: 3, label: "BVB" }, "BVB", null)).toBe("right");
    expect(ourFullTimeSide({ goals: 3, label: "8VB" }, { goals: 0, label: "Rivals" }, "BVB", null)).toBe("left");
    expect(ourFullTimeSide({ goals: 0, label: null }, { goals: 3, label: null }, "BVB", 3)).toBe("right");
    expect(ourFullTimeSide({ goals: 2, label: null }, { goals: 2, label: null }, "BVB", 2)).toBeNull();
    expect(ourFullTimeSide({ goals: 1, label: "A" }, { goals: 2, label: "B" }, null, null)).toBeNull();
  });

  const ms = [
    match("1", 3, 0, { us: { shots: 6, possession_pct: 55 }, them: { shots: 2, possession_pct: 45 } }, { m: 4600, dom: 4200 }),
    match("2", 2, 0, { us: { shots: 4, possession_pct: 51 }, them: { shots: 3, possession_pct: 49 } }, { m: 3000, dom: 5000 }),
    match("3", 0, 1, { us: { shots: 1, possession_pct: 40 }, them: { shots: 7, possession_pct: 60 } }, { m: 2000, dom: 2600 }),
    match("4", null, null, null, { m: 1000, dom: 1000 }),
  ];

  it("averages team stats per outcome and ignores unscored matches", () => {
    const s = teamStatsByOutcome(ms, ["shots", "possession_pct"]);
    expect(s.W).toEqual({ games: 2, us: { shots: 5, possession_pct: 53 }, them: { shots: 2.5, possession_pct: 47 } });
    expect(s.L.games).toBe(1);
    expect(s.L.them.shots).toBe(7);
    expect(s.D).toEqual({ games: 0, us: { shots: null, possession_pct: null }, them: { shots: null, possession_pct: null } });
  });

  it("splits a player's averages by outcome", () => {
    const m = playerByOutcome(ms, "m");
    expect(m.W.games).toBe(2);
    expect(m.W.stats.total_points.average).toBe(3800);
    expect(m.L.stats.total_points.average).toBe(2000);
    expect(m.W.stats.goals.total).toBe(1);
  });

  it("the API accepts Full Time team stats and rejects nonsense", () => {
    const base = {
      played_at: null,
      team_name: "BVB",
      goals_for: 3,
      goals_against: 0,
      players: [
        { slot: 1, player_id: "3f1a6c1e-8a51-4f1f-9a4b-2d6f3b7c9e01", ingame_name: null, stats: {} },
        { slot: 2, player_id: "3f1a6c1e-8a51-4f1f-9a4b-2d6f3b7c9e02", ingame_name: null, stats: {} },
      ],
    };
    const parsed = squadMatchSchema.parse(base);
    expect(parsed.team_stats).toBeNull();
    expect(parsed.opponent_name).toBeNull();
    expect(squadMatchSchema.safeParse({ ...base, team_stats: { us: { shots: 5, penalties: 4 }, them: { possession_pct: 46 } } }).success).toBe(true);
    expect(squadMatchSchema.safeParse({ ...base, team_stats: { us: { possession_pct: 140 }, them: {} } }).success).toBe(false);
    expect(squadMatchSchema.safeParse({ ...base, team_stats: { us: { total_points: 4 }, them: {} } }).success).toBe(false);
  });
});
