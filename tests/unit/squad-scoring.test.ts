import { describe, expect, it } from "vitest";
import type { SquadMatch, SquadStats } from "@/lib/domain/squad";
import { scoringBoard, scoringTimeline } from "@/lib/domain/squad-scoring";

const A = "a";
const B = "b";
const C = "c";

function match(id: string, at: string, lines: Array<[string, SquadStats]>): SquadMatch {
  return {
    id,
    played_at: at,
    created_at: at,
    team_name: "BVB",
    opponent_name: null,
    goals_for: 1,
    goals_against: 0,
    team_stats: null,
    players: lines.map(([pid, stats], i) => ({ slot: (i + 1) as 1 | 2 | 3, player_id: pid, ingame_name: null, stats, awards: [] })),
  };
}

const matches = [
  // Newest first, as the page loads them.
  match("m3", "2026-11-03T00:00:00Z", [[A, { goals: 0, assists: 2, shots: 1 }], [B, { goals: 2, assists: 0, shots: 4 }], [C, { goals: 0, assists: 0, shots: 0 }]]),
  match("m2", "2026-11-02T00:00:00Z", [[A, { goals: 1, assists: null, shots: 2 }], [B, { goals: 0, assists: 1, shots: 1 }]]),
  match("m1", "2026-11-01T00:00:00Z", [[A, { goals: 2, assists: 1, shots: 3 }], [B, {}], [C, { goals: null, assists: 1 }]]),
];

describe("3v3 goals and assists board", () => {
  it("sums goals and assists over every match, sorted by goal contributions", () => {
    const board = scoringBoard(matches, [A, B, C]);
    expect(board.map((r) => r.playerId)).toEqual([A, B, C]);
    const a = board[0];
    expect(a).toMatchObject({ goals: 3, assists: 3, contributions: 6, games: 3, shots: 6, best: 3 });
    expect(a.perGame).toBeCloseTo(2);
    expect(a.conversion).toBeCloseTo(50);
    expect(board[1]).toMatchObject({ goals: 2, assists: 1, contributions: 3, games: 3, best: 2 });
    expect(board[2]).toMatchObject({ goals: 0, assists: 1, contributions: 1, games: 2, conversion: null });
  });

  it("ranks ties by goals, then by fewer games", () => {
    const tie = [match("x", "2026-11-01T00:00:00Z", [[A, { goals: 1, assists: 1 }], [B, { goals: 2, assists: 0 }]])];
    expect(scoringBoard(tie, [A, B]).map((r) => r.playerId)).toEqual([B, A]);
  });

  it("gives a player with no games an empty row", () => {
    const [row] = scoringBoard(matches, ["nobody"]);
    expect(row).toMatchObject({ goals: 0, assists: 0, contributions: 0, games: 0, perGame: null, best: 0 });
  });

  it("builds the running total of goals + assists, oldest match first", () => {
    const line = scoringTimeline(matches, [A, B, C]);
    expect(line.map((p) => p.label)).toEqual(["#1", "#2", "#3"]);
    expect(line.map((p) => p.values[A])).toEqual([3, 4, 6]);
    expect(line.map((p) => p.values[B])).toEqual([0, 1, 3]);
    expect(line.map((p) => p.values[C])).toEqual([1, 1, 1]);
  });
});
