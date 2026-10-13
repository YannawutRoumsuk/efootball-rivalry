import { describe, expect, it } from "vitest";
import {
  allPairs,
  computeStandings,
  matchesBetween,
  pairFor,
  pairRecords,
  pointsTimeline,
  resolvePair,
  type RosterPlayer,
} from "@/lib/domain/league";
import { toPerspectives } from "@/lib/domain/match";
import { summarizeRivalry } from "@/lib/domain/stats";
import type { Match, MatchStatus } from "@/lib/domain/types";
import { side } from "./fixtures";

const ROSTER: RosterPlayer[] = [
  { id: "p1", display_name: "One", avatar_url: null, seat: 1 },
  { id: "p2", display_name: "Two", avatar_url: null, seat: 2 },
  { id: "p3", display_name: "Three", avatar_url: null, seat: 3 },
];

/** Match between any two seats: m(no, leftId, leftGoals, rightId, rightGoals) */
function m(no: number, left: string, lg: number, right: string, rg: number, status: MatchStatus = "confirmed"): Match {
  const l = { ...side("a", "left", { goals: lg }), player_id: left };
  const r = { ...side("b", "right", { goals: rg }), player_id: right };
  return {
    id: `m${no}`,
    match_no: no,
    played_at: null,
    status,
    status_note: null,
    created_by: left,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    sides: [l, r],
  };
}

const MATCHES = [
  m(1, "p1", 3, "p2", 1), // 1 beats 2
  m(2, "p3", 2, "p1", 2), // 3 draws 1
  m(3, "p2", 0, "p3", 4), // 3 beats 2 (3 on the right)
  m(4, "p1", 1, "p3", 0), // 1 beats 3
  m(5, "p2", 5, "p1", 0, "disputed"), // excluded
];

describe("three-player league", () => {
  it("builds a points table with tie-breaks, from confirmed matches only", () => {
    const table = computeStandings(MATCHES, ROSTER);
    expect(table.map((r) => [r.player.id, r.points, r.played, r.goalDiff])).toEqual([
      ["p1", 7, 3, 3],
      ["p3", 4, 3, 3],
      ["p2", 0, 2, -6],
    ]);
    expect(table[0]).toMatchObject({ wins: 2, draws: 1, losses: 0, goalsFor: 6, goalsAgainst: 3 });
    expect(table[0].form).toEqual(["W", "D", "W"]);
  });

  it("records every pair's head-to-head", () => {
    const recs = pairRecords(MATCHES, ROSTER).map((r) => `${r.a.id}-${r.b.id}:${r.winsA}-${r.draws}-${r.winsB}`);
    expect(recs).toEqual(["p1-p2:1-0-0", "p1-p3:1-1-0", "p2-p3:0-0-1"]);
    expect(allPairs(ROSTER)).toHaveLength(3);
  });

  it("feeds the existing two-player stats engine one pair at a time", () => {
    const between = matchesBetween(MATCHES, "p3", "p1");
    expect(between.map((x) => x.match_no)).toEqual([2, 4]);
    const pair = pairFor(ROSTER, "p3", "p1");
    expect(pair.a.id).toBe("p1");
    expect(pair.seats).toEqual([1, 3]);
    const s = summarizeRivalry(toPerspectives(between, pair));
    expect([s.a.wins, s.draws, s.b.wins]).toEqual([1, 1, 0]);
  });

  it("tracks cumulative points per seat", () => {
    const t = pointsTimeline(MATCHES, ROSTER);
    expect(t.map((p) => [p.p1, p.p2, p.p3])).toEqual([
      [3, 0, 0],
      [4, 0, 1],
      [4, 0, 4],
      [7, 0, 4],
    ]);
  });

  it("resolves the pair to show: explicit param, else my most-played opponent", () => {
    expect(resolvePair("3-2", ROSTER, MATCHES, null)!.map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(resolvePair(undefined, ROSTER, MATCHES, "p3")!.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(resolvePair("9-9", ROSTER, [], null)!.map((p) => p.id)).toEqual(["p1", "p2"]);
  });
});
