import { describe, expect, it } from "vitest";
import { toPerspectives } from "@/lib/domain/match";
import { aggregate, pairedPercent, percent } from "@/lib/domain/math";
import { computeStreaks, recentForm, summarizeRivalry } from "@/lib/domain/stats";
import { PAIR, match } from "./fixtures";

const seq = (...ms: ReturnType<typeof match>[]) => toPerspectives(ms, PAIR);

describe("(4) goal difference", () => {
  it("sums scored minus conceded per real player across side swaps", () => {
    const s = summarizeRivalry(seq(match(1, 13, 0), match(2, 3, 2, { aOnLeft: false }), match(3, 1, 4)));
    expect(s.a.goalsFor).toBe(17);
    expect(s.a.goalsAgainst).toBe(6);
    expect(s.a.goalDifference).toBe(11);
    expect(s.b.goalDifference).toBe(-11);
    expect(s.a.wins).toBe(2);
    expect(s.b.wins).toBe(1);
    expect(s.a.winRate).toBeCloseTo(66.667, 2);
    expect(s.a.cleanSheets).toBe(1);
    expect(s.biggestWin).toMatchObject({ winner: "a", margin: 13, matchNo: 1 });
    expect(s.highestScoringMatch).toMatchObject({ totalGoals: 13, matchNo: 1 });
  });

  it("counts draws for both players", () => {
    const s = summarizeRivalry(seq(match(1, 1, 1), match(2, 0, 0, { aOnLeft: false })));
    expect(s.draws).toBe(2);
    expect(s.a.draws).toBe(2);
    expect(s.b.draws).toBe(2);
    expect(s.a.losses).toBe(0);
    expect(s.a.cleanSheets).toBe(1);
    expect(s.biggestWin).toBeNull();
  });
});

describe("(5) win streaks", () => {
  it("tracks current and longest streaks; draws break streaks", () => {
    // A A A B D A A
    const ms = seq(
      match(1, 1, 0),
      match(2, 2, 0),
      match(3, 3, 1),
      match(4, 0, 1),
      match(5, 2, 2),
      match(6, 1, 0),
      match(7, 4, 0),
    );
    const { current, longest } = computeStreaks(ms);
    expect(longest).toEqual({ a: 3, b: 1 });
    expect(current).toEqual({ holder: "a", length: 2 });
  });

  it("current streak resets after a draw", () => {
    expect(computeStreaks(seq(match(1, 1, 0), match(2, 1, 1))).current).toEqual({ holder: null, length: 0 });
  });

  it("(14) uses match_no order, not upload (created_at) order", () => {
    // Passed shuffled; fixtures give later matches an EARLIER created_at.
    const ms = seq(match(3, 0, 1), match(1, 1, 0), match(2, 1, 0));
    expect(ms.map((m) => m.match.match_no)).toEqual([1, 2, 3]);
    expect(computeStreaks(ms).current).toEqual({ holder: "b", length: 1 });
    expect(computeStreaks(ms).longest).toEqual({ a: 2, b: 1 });
  });

  it("handles an empty dataset", () => {
    const s = summarizeRivalry([]);
    expect(s.totalMatches).toBe(0);
    expect(s.a.winRate).toBeNull();
    expect(s.a.avgGoalsFor).toBeNull();
    expect(s.a.shotAccuracy).toBeNull();
    expect(s.currentStreak).toEqual({ holder: null, length: 0 });
    expect(s.highestScoringMatch).toBeNull();
  });
});

describe("(6) recent form", () => {
  it("returns the last N results oldest → newest for each player", () => {
    const ms = seq(match(1, 1, 0), match(2, 0, 1), match(3, 1, 1), match(4, 2, 0), match(5, 0, 3), match(6, 5, 1));
    expect(recentForm(ms, "a", 5)).toEqual(["L", "D", "W", "L", "W"]);
    expect(recentForm(ms, "b", 5)).toEqual(["W", "D", "L", "W", "L"]);
    expect(recentForm(ms, "a", 10)).toHaveLength(6);
  });
});

describe("(7) match statistics aggregation", () => {
  it("excludes missing values from averages instead of treating them as zero", () => {
    expect(aggregate([10, null, 20])).toEqual({ total: 30, average: 15, samples: 2 });
    expect(aggregate([null, null])).toEqual({ total: 0, average: null, samples: 0 });
  });

  it("computes ratio stats from totals, only where both values exist", () => {
    const ms = seq(
      match(1, 2, 0, { a: { shots: 10, shots_on_target: 5, passes: 200, successful_passes: 150, possession_pct: 60 } }),
      match(2, 1, 1, { a: { shots: 10, shots_on_target: null, passes: 100, successful_passes: 100 } }),
      match(3, 3, 0, { aOnLeft: false, a: { shots: 10, shots_on_target: 9, possession_pct: 50 } }),
    );
    const s = summarizeRivalry(ms);
    expect(s.a.shots).toEqual({ total: 30, average: 10, samples: 3 });
    // (5 + 9) / (10 + 10): the match without shots-on-target is excluded entirely.
    expect(s.a.shotAccuracy).toBeCloseTo(70);
    // goals in matches that reported shots / total shots = 6 / 30
    expect(s.a.conversionRate).toBeCloseTo(20);
    expect(s.a.passCompletion).toBeCloseTo((250 / 300) * 100);
    expect(s.a.possession.average).toBe(55);
    expect(s.a.possession.samples).toBe(2);
    expect(s.b.shots.average).toBeNull();
    expect(s.a.bestShotAccuracy).toMatchObject({ matchNo: 3, accuracy: 90 });
  });

  it("divides safely", () => {
    expect(percent(1, 0)).toBeNull();
    expect(pairedPercent([{ part: 0, whole: 0 }])).toBeNull();
    expect(pairedPercent([{ part: null, whole: 5 }])).toBeNull();
  });

  it("excludes disputed and void matches from official stats", () => {
    const s = summarizeRivalry(
      seq(match(1, 1, 0), match(2, 0, 5, { status: "disputed" }), match(3, 0, 5, { status: "void" })),
    );
    expect(s.totalMatches).toBe(1);
    expect(s.b.goalsFor).toBe(0);
  });
});
