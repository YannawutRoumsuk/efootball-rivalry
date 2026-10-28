import { describe, expect, it } from "vitest";
import { computeElo, matchScore, ELO } from "@/lib/domain/elo";
import { computeStandings, type RosterPlayer } from "@/lib/domain/league";
import { hasShootout, sideWinner, winnerPlayerId } from "@/lib/domain/match";
import type { Match, MatchSide } from "@/lib/domain/types";
import { emptyDraftSide, validateSides } from "@/lib/domain/validation";

const side = (player_id: string, goals: number, penalties: number | null = null): MatchSide => ({
  player_id,
  screen_side: player_id === "p" ? "left" : "right",
  onscreen_label: null,
  team_name: null,
  goals,
  penalties,
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
});

let no = 0;
const match = (x: MatchSide, y: MatchSide): Match => {
  no += 1;
  return {
    id: `m${no}`,
    match_no: no,
    played_at: null,
    status: "confirmed",
    status_note: null,
    created_by: "p",
    created_at: "2026-10-20T10:00:00Z",
    updated_at: "2026-10-20T10:00:00Z",
    sides: [x, y],
  };
};

const roster: RosterPlayer[] = [
  { id: "p", display_name: "P", avatar_url: null, seat: 1 },
  { id: "q", display_name: "Q", avatar_url: null, seat: 2 },
];

describe("who won", () => {
  it("decides a level score on penalties, and only then", () => {
    expect(sideWinner(side("p", 7, 6), side("q", 7, 7))).toBe("y");
    expect(sideWinner(side("p", 2, 9), side("q", 1, 0))).toBe("x"); // goals win first
    expect(sideWinner(side("p", 1), side("q", 1))).toBeNull();
    expect(hasShootout(side("p", 7, 6), side("q", 7, 7))).toBe(true);
    expect(winnerPlayerId(match(side("p", 7, 6), side("q", 7, 7)))).toBe("q");
  });

  it("gives the shoot-out winner a full win in the league table, and keeps goals as played", () => {
    const [first, second] = computeStandings([match(side("p", 7, 6), side("q", 7, 7))], roster);
    expect(first).toMatchObject({ player: { id: "q" }, wins: 1, draws: 0, points: 3, goalsFor: 7, goalsAgainst: 7, goalDiff: 0 });
    expect(second).toMatchObject({ player: { id: "p" }, losses: 1, points: 0 });
  });
});

describe("Elo for shoot-outs", () => {
  it("scores a shoot-out win between a draw and a normal win", () => {
    expect(matchScore("W", 0.5, true)).toBeLessThan(matchScore("W", 0.5));
    expect(matchScore("W", 0.5, true)).toBeGreaterThan(matchScore("D", 0.5));
    expect(matchScore("L", 0.5, true)).toBeCloseTo(1 - matchScore("W", 0.5, true));
  });

  it("moves ratings less than a normal-time win, but the winner still gains", () => {
    const pens = computeElo([match(side("p", 7, 6), side("q", 7, 7))], ["p", "q"]).players;
    const normal = computeElo([match(side("p", 7), side("q", 8))], ["p", "q"]).players;
    const pensGain = pens.get("q")!.rating - ELO.start;
    const normalGain = normal.get("q")!.rating - ELO.start;
    expect(pensGain).toBeGreaterThanOrEqual(ELO.minWinnerGain);
    expect(pensGain).toBeLessThan(normalGain);
  });
});

describe("validating a shoot-out", () => {
  const draft = (goals: number, penalties: number | null) => ({ ...emptyDraftSide(), goals, penalties });
  const codes = (l: ReturnType<typeof draft>, r: ReturnType<typeof draft>) => validateSides(l, r).map((i) => i.code);

  it("accepts a level score with different shoot-out totals", () => {
    expect(codes(draft(7, 6), draft(7, 7))).toEqual([]);
  });

  it("rejects a shoot-out after a decisive score, a missing side, or a level shoot-out", () => {
    expect(codes(draft(2, 4), draft(1, 3))).toContain("pensNotLevel");
    expect(codes(draft(1, 4), draft(1, null))).toContain("pensBoth");
    expect(codes(draft(1, 4), draft(1, 4))).toContain("pensTie");
  });
});

describe("the API rejects an invalid shoot-out too", async () => {
  const { createMatchSchema } = await import("@/lib/domain/validation");
  const input = (lp: number | null, rp: number | null, lg = 7, rg = 7) => ({
    upload_id: null,
    played_on: null,
    sides: [
      { ...side("p", lg, lp), screen_side: "left" },
      { ...side("q", rg, rp), screen_side: "right" },
    ].map((s) => ({ ...s, player_id: s.player_id === "p" ? "00000000-0000-4000-8000-000000000001" : "00000000-0000-4000-8000-000000000002" })),
  });

  it("accepts a valid shoot-out and rejects broken ones", () => {
    expect(createMatchSchema.safeParse(input(6, 7)).success).toBe(true);
    expect(createMatchSchema.safeParse(input(6, 6)).success).toBe(false);
    expect(createMatchSchema.safeParse(input(6, null)).success).toBe(false);
    expect(createMatchSchema.safeParse(input(6, 7, 2, 1)).success).toBe(false);
  });
});
