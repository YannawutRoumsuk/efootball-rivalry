import { describe, expect, it } from "vitest";
import { normalizeInviteCode, generateInviteCode, hashInviteCode } from "@/lib/domain/invite";
import { parseHistoryQuery, queryHistory } from "@/lib/domain/history";
import { buildInsights } from "@/lib/domain/insights";
import { toPerspectives } from "@/lib/domain/match";
import { detectNewRecords } from "@/lib/domain/records";
import { summarizeRivalry } from "@/lib/domain/stats";
import { applyRange, buildTimeline, parseRange } from "@/lib/domain/timeline";
import { PAIR, match } from "./fixtures";

const seq = (...ms: ReturnType<typeof match>[]) => toPerspectives(ms, PAIR);

describe("timeline", () => {
  it("builds cumulative wins, goal difference, streak and rolling win rates", () => {
    const ms = seq(match(1, 2, 0), match(2, 0, 1, { aOnLeft: false }), match(3, 1, 1), match(4, 3, 0), match(5, 1, 0));
    const t = buildTimeline(ms);
    expect(t.map((p) => p.cumWinsA)).toEqual([1, 1, 1, 2, 3]);
    expect(t.map((p) => p.cumWinsB)).toEqual([0, 1, 1, 1, 1]);
    expect(t.map((p) => p.cumGoalDiffA)).toEqual([2, 1, 1, 4, 5]);
    expect(t.map((p) => p.streak)).toEqual([1, -1, 0, 1, 2]);
    expect(t[3].rolling5A).toBeNull();
    expect(t[4].rolling5A).toBe(60);
    expect(t[4].rolling5B).toBe(20);
    expect(t[4].rolling10A).toBeNull();
  });

  it("filters ranges; date ranges exclude undated matches and report them", () => {
    const ms = seq(
      match(1, 1, 0, { playedAt: "2026-09-01T12:00:00.000Z" }),
      match(2, 1, 0),
      match(3, 0, 1, { playedAt: "2026-10-05T12:00:00.000Z" }),
    );
    expect(applyRange(ms, { kind: "last", count: 2 }).matches.map((m) => m.match.match_no)).toEqual([2, 3]);
    const r = applyRange(ms, { kind: "dates", from: "2026-10-01", to: "2026-10-31" });
    expect(r.matches.map((m) => m.match.match_no)).toEqual([3]);
    expect(r.undatedExcluded).toBe(1);
    expect(parseRange({ range: "last10" })).toEqual({ kind: "last", count: 10 });
    expect(parseRange({ range: "dates", from: "bad" })).toEqual({ kind: "dates", from: null, to: null });
  });
});

describe("new records", () => {
  it("reports records the new match strictly broke", () => {
    const before = seq(match(1, 2, 0), match(2, 1, 0));
    const after = seq(match(1, 2, 0), match(2, 1, 0), match(3, 7, 1));
    const kinds = detectNewRecords(before, after, "m-3", PAIR).map((r) => r.kind);
    expect(kinds).toEqual(["biggest_win", "longest_streak", "highest_scoring_match", "most_goals_single_player"]);
  });

  it("does not report ties or the first match", () => {
    expect(detectNewRecords([], seq(match(1, 5, 0)), "m-1", PAIR)).toEqual([]);
    const before = seq(match(1, 3, 0));
    const after = seq(match(1, 3, 0), match(2, 0, 3));
    expect(detectNewRecords(before, after, "m-2", PAIR)).toEqual([]);
  });
});

describe("insights", () => {
  it("are backed by real numbers", () => {
    const ms = seq(
      match(1, 1, 0, { a: { shots: 20, shots_on_target: 5 }, b: { shots: 4, shots_on_target: 4 } }),
      match(2, 2, 1, { a: { shots: 20, shots_on_target: 5 }, b: { shots: 4, shots_on_target: 3 } }),
      match(3, 1, 0),
      match(4, 0, 2),
      match(5, 3, 0),
    );
    const s = summarizeRivalry(ms);
    const text = buildInsights(s, ms, PAIR).map((i) => i.text);
    expect(text).toContain("KynGian leads the rivalry 4–1 in wins.");
    expect(text).toContain("KynGian has won 4 of the last 5 matches.");
    expect(text.some((t) => t.startsWith("Friend has the better shot accuracy"))).toBe(true);
  });

  it("returns nothing for an empty rivalry", () => {
    expect(buildInsights(summarizeRivalry([]), [], PAIR)).toEqual([]);
  });
});

describe("match history query", () => {
  const all = [
    match(1, 1, 0),
    match(2, 0, 2, { aOnLeft: false }),
    match(3, 4, 4),
    match(4, 9, 0, { status: "void" }),
    match(5, 0, 1, { status: "disputed" }),
  ];

  it("lists newest first and hides void by default", () => {
    const page = queryHistory(all, PAIR, parseHistoryQuery({}));
    expect(page.items.map((m) => m.match_no)).toEqual([5, 3, 2, 1]);
  });

  it("filters by winner using player IDs", () => {
    expect(queryHistory(all, PAIR, parseHistoryQuery({ filter: "b_wins" })).items.map((m) => m.match_no)).toEqual([5, 2]);
    expect(queryHistory(all, PAIR, parseHistoryQuery({ filter: "draws" })).items.map((m) => m.match_no)).toEqual([3]);
  });

  it("sorts highest-scoring first", () => {
    const page = queryHistory(all, PAIR, parseHistoryQuery({ filter: "high_scoring", void: "1" }));
    expect(page.items[0].match_no).toBe(4);
    expect(page.items[1].match_no).toBe(3);
  });
});

describe("invite codes", () => {
  it("generates normalisable codes and stable hashes", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^([A-Z0-9]{4}-){3}[A-Z0-9]{4}$/);
    const n = normalizeInviteCode(` ${code.toLowerCase()} `);
    expect(n).toBe(code.replaceAll("-", ""));
    expect(hashInviteCode(n!)).toMatch(/^[0-9a-f]{64}$/);
    expect(normalizeInviteCode("short")).toBeNull();
    expect(normalizeInviteCode("OOOO-1111-OOOO-1111")).toBeNull();
  });
});
