import { describe, expect, it } from "vitest";
import { summarizeSquadPlayer, type SquadMatch } from "@/lib/domain/squad";
import { metricValue, standings, strengthsAndWeaknesses } from "@/lib/domain/squad-insights";

const match = (rows: Array<[string, Record<string, number>]>): SquadMatch => ({
  id: "1",
  played_at: "2026-11-22T12:00:00Z",
  team_name: "BVB",
  opponent_name: null,
  goals_for: 3,
  goals_against: 0,
  team_stats: null,
  created_at: "2026-11-22T12:00:00Z",
  players: rows.map(([pid, stats], i) => ({ slot: (i + 1) as 1 | 2 | 3, player_id: pid, ingame_name: null, stats })),
});

// The BVB match: M leads offensive positioning/dueling/passing/dribbling, DOM shooting and
// defensive positioning, Big scored twice but has the lowest category points.
const bvb = match([
  ["m", { offensive_positioning: 960, shooting: 370, dueling: 2177, defensive_positioning: 130, passing: 303, dribbling: 675, goals: 0, shots: 1, shots_on_target: 1, passes: 29, successful_passes: 16, intercepts: 17 }],
  ["dom", { offensive_positioning: 591, shooting: 661, dueling: 1921, defensive_positioning: 375, passing: 265, dribbling: 475, goals: 1, shots: 2, shots_on_target: 1, passes: 10, successful_passes: 8, intercepts: 14 }],
  ["big", { offensive_positioning: 539, shooting: 308, dueling: 1327, defensive_positioning: 306, passing: 187, dribbling: 243, goals: 2, shots: 2, shots_on_target: 2, passes: 14, successful_passes: 12, intercepts: 4 }],
]);
const summaries = ["m", "dom", "big"].map((id) => summarizeSquadPlayer([bvb], id));

describe("strengths and weaknesses", () => {
  it("ranks every player per metric against the team average", () => {
    const s = standings(summaries);
    const mDef = s.get("m")!.find((x) => x.metric === "defensive_positioning")!;
    expect(mDef).toMatchObject({ rank: 3, of: 3, worst: true, best: false });
    expect(mDef.lift).toBeCloseTo((130 - 811 / 3) / (811 / 3));
    const domShoot = s.get("dom")!.find((x) => x.metric === "shooting")!;
    expect(domShoot).toMatchObject({ rank: 1, best: true });
    expect(metricValue(summaries[1], "pass_completion")).toBe(80);
  });

  it("picks the clearest strengths and the weakest areas", () => {
    const s = standings(summaries);
    const m = strengthsAndWeaknesses(s.get("m")!);
    expect(m.strengths.every((x) => x.lift > 0)).toBe(true);
    // The real strengths (game ratings) come before thin counts like one assist.
    expect(m.strengths.map((x) => x.metric)).toEqual(expect.arrayContaining(["dribbling", "offensive_positioning"]));
    expect(m.strengths.map((x) => x.metric)).not.toContain("assists");
    expect(m.weaknesses[0].metric).toBe("defensive_positioning");
    const big = strengthsAndWeaknesses(s.get("big")!);
    expect(big.strengths.map((x) => x.metric)).toContain("goals");
    expect(big.weaknesses.map((x) => x.metric)).toEqual(expect.arrayContaining(["intercepts"]));
    expect(big.weaknesses.every((x) => x.lift < 0)).toBe(true);
  });

  it("calls nothing a strength when everyone is level, and needs two players", () => {
    const level = ["a", "b"].map((id) => summarizeSquadPlayer([match([["a", { goals: 1 }], ["b", { goals: 1 }]])], id));
    const s = standings(level);
    expect(s.get("a")![0]).toMatchObject({ best: false, worst: false, lift: 0 });
    expect(strengthsAndWeaknesses(s.get("a")!)).toEqual({ strengths: [], weaknesses: [] });
    const solo = standings([summarizeSquadPlayer([bvb], "m")]);
    expect(solo.get("m")).toEqual([]);
  });
});
