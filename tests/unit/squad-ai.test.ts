import { describe, expect, it } from "vitest";
import { mergeScreenReads, parseCell } from "@/lib/domain/squad";
import { fillFromAi, needsAiHelp, sanitizeAiSquad, type ReadWithRows } from "@/lib/domain/squad-ai";
import { squadMatchSchema } from "@/lib/domain/squad-schema";

const ocr: ReadWithRows = {
  names: ["WyNM", "bigverx", null],
  team: "BVB",
  rows: ["Passing", "Dribbling"],
  values: { passing: [125, 87, 28], dribbling: [null, 81, null] },
  awards: null,
};

describe("AI fallback for 3v3 screenshots", () => {
  it("is only asked when OCR left a blank or understood nothing", () => {
    expect(needsAiHelp(ocr, false)).toBe(true);
    expect(needsAiHelp({ ...ocr, values: { passing: [1, 2, 3] } }, false)).toBe(false);
    expect(needsAiHelp({ ...ocr, values: { passing: [1, 2, 3], total_points: [null, null, null] } }, false)).toBe(false);
    expect(needsAiHelp({ ...ocr, rows: [], values: {} }, false)).toBe(true);
    expect(needsAiHelp({ ...ocr, rows: [], values: {} }, true)).toBe(false);
    expect(needsAiHelp({ ...ocr, rows: [], values: {}, awards: [[{ title: "A", tier: "gold" }], [], []] }, false)).toBe(true);
  });

  it("fills only blanks (keeps OCR values), parses negatives, adds missing rows and names", () => {
    const ai = sanitizeAiSquad({
      screen: "table",
      team: "BVB",
      names: ["WyNM", "bigverx", "Do3minicT0rett0"],
      rows: [
        { label: "Passing", values: ["999", "87", "28"] },
        { label: "Dribbling", values: ["-23", "81", "-47"] },
        { label: "Dribbles (Successful)", values: ["21 (17)", "13 (12)", null] },
        { label: "Evaluation Graph", values: [null, null, null] },
      ],
      awards: [],
    })!;
    const { read, filled } = fillFromAi(ocr, ai);
    expect(read.values.passing).toEqual([125, 87, 28]);
    expect(read.values.dribbling).toEqual([-23, 81, -47]);
    expect(read.values.dribbles).toEqual([21, 13, null]);
    expect(read.values.successful_dribbles).toEqual([17, 12, null]);
    expect(read.names[2]).toBe("Do3minicT0rett0");
    expect(read.rows).toContain("Dribbles (Successful)");
    expect(filled).toBe(6);
    expect(ocr.values.dribbling).toEqual([null, 81, null]);
  });

  it("fills awards from the model when OCR read none for a column", () => {
    const awardsRead: ReadWithRows = { names: ["WyNM", "bigverx", null], team: null, rows: [], values: {}, awards: [[{ title: "The Architect", tier: "gold" }], [], []] };
    const ai = sanitizeAiSquad({
      screen: "awards",
      team: null,
      names: ["WyNM", "bigverx", "Do3minicT0rett0"],
      rows: [],
      awards: [[{ title: "Wrong", tier: "bronze" }], [{ title: "Pass Receiver", tier: "bronze" }], [{ title: "First Blood", tier: "silver" }]],
    })!;
    const { read, filled } = fillFromAi(awardsRead, ai);
    expect(read.awards!.map((l) => l[0]?.title)).toEqual(["The Architect", "Pass Receiver", "First Blood"]);
    expect(filled).toBe(2);
  });

  it("rejects a malformed model answer and ignores a screen of another kind", () => {
    expect(sanitizeAiSquad({ screen: "table" })).toBeNull();
    // An extra column or over-long text is trimmed, not a reason to drop the answer.
    const long = sanitizeAiSquad({ screen: "table", team: "BVB", names: ["a", "b", "c", "d"], rows: [{ label: "Passing", values: ["1", "2", "3", "4"] }], awards: [] })!;
    expect(long.names).toEqual(["a", "b", "c"]);
    expect(long.rows[0].values).toHaveLength(3);
    expect(fillFromAi({ ...ocr, names: ["", "bigverx", null] }, long).read.names[0]).toBe("a");
    expect(sanitizeAiSquad({ screen: "x", team: null, names: [], rows: [], awards: [] })).toBeNull();
    const other = sanitizeAiSquad({ screen: "fulltime", team: null, names: [null, null, null], rows: [], awards: [] })!;
    expect(fillFromAi(ocr, other).filled).toBe(0);
  });
});

describe("negative evaluation points and awards in a match", () => {
  it("parses a minus sign only for signed rows", () => {
    expect(parseCell("-23", "int", true)).toEqual([-23]);
    expect(parseCell("-23", "int")).toBeNull();
  });

  it("matches award columns by name, falling back to the remaining column", () => {
    const table = { names: ["WyNM", "bigverx", "Do3minicTOrett0"], team: "BVB", values: { goals: [0, 0, 1] } };
    const awards = {
      names: ["bigverx", null, "WyNM"],
      team: null,
      values: {},
      awards: [[{ title: "Reliable", tier: "bronze" as const }], [{ title: "Goal Hunter", tier: "silver" as const }], [{ title: "Maestro", tier: "silver" as const }]],
    };
    const d = mergeScreenReads([table, awards], []);
    expect(d.columns.map((c) => c.awards.map((a) => a.title))).toEqual([["Maestro"], ["Reliable"], ["Goal Hunter"]]);
  });

  it("the API takes negative points for ratings only, and validates titles", () => {
    const base = {
      played_at: null,
      team_name: "BVB",
      goals_for: 1,
      goals_against: 2,
      players: [
        { slot: 1, player_id: "3f1a6c1e-8a51-4f1f-9a4b-2d6f3b7c9e01", ingame_name: "WyNM", stats: { dribbling: -23, total_points: 933 }, awards: [{ title: "The Architect", tier: "gold" }] },
        { slot: 2, player_id: "3f1a6c1e-8a51-4f1f-9a4b-2d6f3b7c9e02", ingame_name: null, stats: {} },
      ],
    };
    const parsed = squadMatchSchema.parse(base);
    expect(parsed.players[1].awards).toEqual([]);
    expect(squadMatchSchema.safeParse({ ...base, players: [{ ...base.players[0], stats: { goals: -1 } }, base.players[1]] }).success).toBe(false);
    expect(squadMatchSchema.safeParse({ ...base, players: [{ ...base.players[0], awards: [{ title: "X", tier: "platinum" }] }, base.players[1]] }).success).toBe(false);
  });
});
