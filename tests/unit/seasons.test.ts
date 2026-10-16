import { describe, expect, it } from "vitest";
import { listSeasons, matchesInScope, parseScope, seasonOf } from "@/lib/domain/seasons";
import type { Match } from "@/lib/domain/types";

const EPOCH = "2026-10-16T09:00:00Z";

function m(id: string, created_at: string, played_at: string | null = null): Match {
  return {
    id,
    match_no: Number(id.slice(1)),
    played_at,
    status: "confirmed",
    status_note: null,
    created_by: "p",
    created_at,
    updated_at: created_at,
    sides: [] as unknown as Match["sides"],
  };
}

describe("seasonOf", () => {
  it("puts everything recorded before the season system started into the pre-season", () => {
    expect(seasonOf(m("m1", "2026-10-13T10:00:00Z"), EPOCH)).toBe("pre");
    // Even when its match date is after the cut-over.
    expect(seasonOf(m("m2", "2026-10-15T10:00:00Z", "2026-10-16T12:00:00Z"), EPOCH)).toBe("pre");
  });

  it("uses quarters (Bangkok time) after the cut-over", () => {
    expect(seasonOf(m("m3", "2026-10-20T10:00:00Z"), EPOCH)).toBe("2026-Q4");
    expect(seasonOf(m("m4", "2026-12-31T18:00:00Z"), EPOCH)).toBe("2027-Q1"); // 01:00 on 1 Jan in Bangkok
    expect(seasonOf(m("m5", "2027-05-02T10:00:00Z"), EPOCH)).toBe("2027-Q2");
  });

  it("prefers the match date, so an old screenshot imported later goes to its own period", () => {
    expect(seasonOf(m("m6", "2027-01-05T10:00:00Z", "2026-11-20T12:00:00Z"), EPOCH)).toBe("2026-Q4");
    expect(seasonOf(m("m7", "2027-01-05T10:00:00Z", "2026-09-01T12:00:00Z"), EPOCH)).toBe("pre");
  });

  it("keeps a match dated on the cut-over day in the new season, even with an evening cut-over", () => {
    const evening = "2026-10-16T13:30:00Z"; // 20:30 in Bangkok, after the 12:00 UTC match-date stamp
    expect(seasonOf(m("m9", "2026-10-16T14:00:00Z", "2026-10-16T12:00:00Z"), evening)).toBe("2026-Q4");
    expect(seasonOf(m("m10", "2026-10-16T14:00:00Z", "2026-10-15T12:00:00Z"), evening)).toBe("pre");
  });

  it("has no pre-season when the group started with seasons on", () => {
    expect(seasonOf(m("m8", "2026-10-13T10:00:00Z"), null)).toBe("2026-Q4");
  });
});

describe("listSeasons", () => {
  it("lists the current season first, then older ones, numbering from the cut-over", () => {
    const matches = [m("m1", "2026-10-13T10:00:00Z"), m("m2", "2027-02-01T10:00:00Z")];
    const seasons = listSeasons(matches, EPOCH, new Date("2027-04-10T00:00:00Z"));
    expect(seasons.map((s) => s.key)).toEqual(["2027-Q2", "2027-Q1", "2026-Q4", "pre"]);
    expect(seasons[0]).toMatchObject({ number: 3, current: true });
    expect(seasons.find((s) => s.key === "2026-Q4")).toMatchObject({ number: 1, current: false });
    expect(seasons.at(-1)).toMatchObject({ key: "pre", number: 0 });
  });

  it("still lists a quarter that only a future-dated match is in", () => {
    const seasons = listSeasons([m("m1", "2026-10-20T10:00:00Z", "2027-02-10T12:00:00Z")], EPOCH, new Date("2026-10-20T00:00:00Z"));
    expect(seasons.map((s) => s.key)).toEqual(["2027-Q1", "2026-Q4"]);
    expect(seasons.find((s) => s.current)?.key).toBe("2026-Q4");
  });

  it("omits the pre-season when nothing was played before the cut-over", () => {
    const seasons = listSeasons([], EPOCH, new Date("2026-10-20T00:00:00Z"));
    expect(seasons.map((s) => s.key)).toEqual(["2026-Q4"]);
  });
});

describe("scopes", () => {
  it("defaults to the current season and accepts all/pre/known keys", () => {
    const seasons = listSeasons([m("m1", "2026-10-13T10:00:00Z")], EPOCH, new Date("2026-10-20T00:00:00Z"));
    expect(parseScope(undefined, seasons)).toBe("2026-Q4");
    expect(parseScope("all", seasons)).toBe("all");
    expect(parseScope("pre", seasons)).toBe("pre");
    expect(parseScope("1999-Q1", seasons)).toBe("2026-Q4");
  });

  it("filters matches by scope", () => {
    const list = [m("m1", "2026-10-13T10:00:00Z"), m("m2", "2026-10-20T10:00:00Z")];
    expect(matchesInScope(list, "pre", EPOCH).map((x) => x.id)).toEqual(["m1"]);
    expect(matchesInScope(list, "2026-Q4", EPOCH).map((x) => x.id)).toEqual(["m2"]);
    expect(matchesInScope(list, "all", EPOCH)).toHaveLength(2);
  });
});
