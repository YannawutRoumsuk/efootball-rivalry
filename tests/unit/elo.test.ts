import { describe, expect, it } from "vitest";
import { computeElo, ELO, expectedScore, matchScore, performanceShare } from "@/lib/domain/elo";
import type { Match, MatchSide } from "@/lib/domain/types";

const stats = (over: Partial<MatchSide> = {}): MatchSide => ({
  player_id: "x",
  screen_side: "left",
  onscreen_label: null,
  team_name: null,
  goals: 0,
  possession_pct: null,
  shots: null,
  shots_on_target: null,
  fouls: null,
  offsides: null,
  corners: null,
  free_kicks: null,
  passes: null,
  successful_passes: null,
  crosses: null,
  interceptions: null,
  tackles: null,
  saves: null,
  ...over,
});

let no = 0;
function match(a: string, ga: number, b: string, gb: number, extra: { a?: Partial<MatchSide>; b?: Partial<MatchSide>; status?: Match["status"] } = {}): Match {
  no += 1;
  return {
    id: `m${no}`,
    match_no: no,
    played_at: null,
    status: extra.status ?? "confirmed",
    status_note: null,
    created_by: a,
    created_at: "2026-10-13T10:00:00Z",
    updated_at: "2026-10-13T10:00:00Z",
    sides: [
      stats({ player_id: a, screen_side: "left", goals: ga, ...extra.a }),
      stats({ player_id: b, screen_side: "right", goals: gb, ...extra.b }),
    ],
  };
}

describe("Elo building blocks", () => {
  it("expects 50% between equal ratings and ~76% for a 200-point favourite", () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5);
    expect(expectedScore(1200, 1000)).toBeCloseTo(0.76, 2);
    expect(expectedScore(1000, 1200)).toBeCloseTo(0.24, 2);
  });

  it("uses only the stats that were recorded, and 50% when there are none", () => {
    expect(performanceShare(stats({ goals: 0 }), stats({ goals: 0 }))).toBeCloseTo(0.5);
    // Goals only: 3 of 4 goals.
    expect(performanceShare(stats({ goals: 3 }), stats({ goals: 1 }))).toBeCloseTo(0.75);
    const full = performanceShare(
      stats({ goals: 2, shots: 10, shots_on_target: 6, possession_pct: 60, passes: 200, successful_passes: 180 }),
      stats({ goals: 2, shots: 10, shots_on_target: 6, possession_pct: 40, passes: 200, successful_passes: 180 }),
    );
    // Everything level except possession (60%): slightly above half.
    expect(full).toBeGreaterThan(0.5);
    expect(full).toBeLessThan(0.55);
  });

  it("keeps the result dominant: a win always scores more than any loss", () => {
    expect(matchScore("W", 0)).toBeCloseTo(ELO.resultWeight);
    expect(matchScore("L", 1)).toBeCloseTo(1 - ELO.resultWeight);
    expect(matchScore("W", 0)).toBeGreaterThan(matchScore("L", 1));
    expect(matchScore("D", 0.5)).toBeCloseTo(0.5);
  });
});

describe("computeElo", () => {
  it("starts everyone at 1000 and marks players with few games as provisional", () => {
    const { players } = computeElo([], ["p", "q", "r"]);
    expect(players.get("p")).toMatchObject({ rating: 1000, games: 0, provisional: true });
  });

  it("is zero-sum and moves the winner up", () => {
    const { players, byMatch } = computeElo([match("p", 2, "q", 0)], ["p", "q"]);
    const change = byMatch.get("m" + no)!;
    expect(change.delta.p).toBeGreaterThan(0);
    expect(change.delta.p + change.delta.q).toBeCloseTo(0);
    expect(players.get("p")!.rating + players.get("q")!.rating).toBeCloseTo(2000);
  });

  it("gives less for beating a much weaker player, more for an upset", () => {
    const history = Array.from({ length: 10 }, () => match("m", 3, "d", 0));
    const before = computeElo(history, ["m", "d", "b"]);
    const favouriteWins = computeElo([...history, match("m", 1, "d", 0)], ["m", "d", "b"]);
    const upset = computeElo([...history, match("d", 1, "m", 0)], ["m", "d", "b"]);
    const gainFav = favouriteWins.players.get("m")!.rating - before.players.get("m")!.rating;
    const gainUpset = upset.players.get("d")!.rating - before.players.get("d")!.rating;
    expect(gainFav).toBeGreaterThan(0);
    expect(gainUpset).toBeGreaterThan(gainFav * 2);
    // The player who sat out is untouched.
    expect(before.players.get("b")!.rating).toBe(1000);
  });

  it("loses fewer points for a close, well-played defeat than for a thrashing", () => {
    const close = computeElo(
      [match("p", 3, "q", 2, { a: { shots_on_target: 5, possession_pct: 45 }, b: { shots_on_target: 6, possession_pct: 55 } })],
      ["p", "q"],
    );
    const thrashed = computeElo(
      [match("p", 6, "q", 0, { a: { shots_on_target: 9, possession_pct: 70 }, b: { shots_on_target: 0, possession_pct: 30 } })],
      ["p", "q"],
    );
    expect(close.players.get("q")!.rating).toBeGreaterThan(thrashed.players.get("q")!.rating);
  });

  it("never lets the winner lose rating, even when outplayed by a weaker player", () => {
    const history = Array.from({ length: 15 }, () => match("m", 4, "d", 0));
    const lucky = match("m", 1, "d", 0, {
      a: { shots_on_target: 1, possession_pct: 25, shots: 2 },
      b: { shots_on_target: 9, possession_pct: 75, shots: 15 },
    });
    const { byMatch } = computeElo([...history, lucky], ["m", "d"]);
    expect(byMatch.get(lucky.id)!.delta.m).toBeGreaterThanOrEqual(ELO.minWinnerGain);
  });

  it("ignores disputed and void matches", () => {
    const { players } = computeElo([match("p", 5, "q", 0, { status: "void" }), match("p", 5, "q", 0, { status: "disputed" })], ["p", "q"]);
    expect(players.get("p")!.rating).toBe(1000);
    expect(players.get("p")!.games).toBe(0);
  });

  it("records a rating timeline after each match", () => {
    const { timeline } = computeElo([match("p", 1, "q", 0), match("q", 1, "p", 0)], ["p", "q"]);
    expect(timeline).toHaveLength(2);
    expect(timeline[0].ratings.p).toBeGreaterThan(1000);
  });
});

describe("guide examples (the /guide/elo page describes these outcomes)", async () => {
  const { ELO_EXAMPLES } = await import("@/lib/domain/elo-examples");
  const d = (id: string) => ELO_EXAMPLES.find((e) => e.id === id)!.change.delta.A;

  it("an upset earns much more than an expected win", () => {
    expect(d("upset")).toBeGreaterThan(d("favourite") * 2);
  });

  it("a close defeat costs far less than a thrashing (the page says almost twice)", () => {
    expect(d("closeLoss")).toBeLessThan(0);
    expect(d("thrashing") / d("closeLoss")).toBeGreaterThan(1.5);
    expect(d("thrashing") / d("closeLoss")).toBeLessThan(2.2);
  });
});
