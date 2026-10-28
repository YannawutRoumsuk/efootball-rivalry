import { describe, expect, it } from "vitest";
import type { RosterPlayer } from "@/lib/domain/league";
import { leaders, playerBoard } from "@/lib/domain/player-stats";
import type { Match, MatchSide } from "@/lib/domain/types";

const side = (player_id: string, goals: number, over: Partial<MatchSide> = {}): MatchSide => ({
  player_id,
  screen_side: "left",
  onscreen_label: null,
  team_name: null,
  goals,
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
const match = (x: MatchSide, y: MatchSide, status: Match["status"] = "confirmed"): Match => {
  no += 1;
  return {
    id: `m${no}`,
    match_no: no,
    played_at: null,
    status,
    status_note: null,
    created_by: "a",
    created_at: "2026-10-20T10:00:00Z",
    updated_at: "2026-10-20T10:00:00Z",
    sides: [x, { ...y, screen_side: "right" }],
  };
};

const roster: RosterPlayer[] = ["a", "b", "c"].map((id, i) => ({ id, display_name: id.toUpperCase(), avatar_url: null, seat: i + 1 }));

describe("all-players board", () => {
  const matches = [
    match(side("a", 3, { shots: 10, shots_on_target: 6, corners: 4 }), side("b", 1, { shots: 4, shots_on_target: 2, corners: 0 })),
    match(side("a", 1, { shots: 6, shots_on_target: 2, corners: 2 }), side("c", 1, { shots: 8, shots_on_target: 5, corners: 6 })),
    match(side("b", 0), side("c", 2, { shots: 12, shots_on_target: 7 })), // b's stats not recorded
    match(side("a", 9), side("b", 0), "void"),
  ];
  const board = playerBoard(matches, roster);
  const row = (id: string) => board.find((r) => r.player.id === id)!;

  it("averages per game across every opponent, confirmed matches only", () => {
    expect(row("a")).toMatchObject({ games: 2, wins: 1, draws: 1, losses: 0 });
    expect(row("a").stats.shots.average).toBe(8);
    expect(row("a").stats.corners.average).toBe(3);
    expect(row("a").goalsFor.average).toBe(2);
    expect(row("a").goalsAgainst.average).toBe(1);
  });

  it("skips stats that weren't recorded instead of counting them as zero", () => {
    expect(row("b").games).toBe(2);
    expect(row("b").stats.shots).toMatchObject({ samples: 1, average: 4 });
  });

  it("computes rates from totals and counts clean sheets", () => {
    expect(row("a").shotAccuracy).toBeCloseTo(50); // 8 of 16
    expect(row("c").shotAccuracy).toBeCloseTo(60); // 12 of 20
    expect(row("c").cleanSheets).toBe(1);
  });

  it("highlights the leader, or nobody on a tie or a single value", () => {
    expect(leaders([8, 4, 10])).toEqual([2]);
    expect(leaders([3, 1, 2], true)).toEqual([1]);
    expect(leaders([5, 5, 5])).toEqual([]);
    expect(leaders([5, null, null])).toEqual([]);
    expect(leaders([5, 5, 2])).toEqual([0, 1]);
    // Compared at the precision shown: 2.04 and 2.01 both read "2.0" → tie; 50.4% vs 49.6% read 50% vs 50%.
    expect(leaders([2.04, 2.01])).toEqual([]);
    expect(leaders([50.4, 49.6], false, 0)).toEqual([]);
    expect(leaders([2.06, 2.01])).toEqual([0]);
  });
});
