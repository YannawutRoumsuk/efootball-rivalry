import { describe, expect, it } from "vitest";
import { sanitizeExtraction } from "@/lib/domain/extraction";
import { createMatchSchema, emptyDraftSide, hasErrors, validateSides } from "@/lib/domain/validation";

const SAMPLE = {
  left: {
    onscreen_label: "KynGian",
    goals: 13, possession: 57, shots: 22, shots_on_target: 17, fouls: 2, offsides: 1, corners: 3,
    free_kicks: 4, passes: 222, successful_passes: 187, crosses: 3, interceptions: 33, tackles: 19, saves: 3,
  },
  right: {
    onscreen_label: "Real Madrid",
    goals: 0, possession: 43, shots: 5, shots_on_target: 2, fouls: 4, offsides: 0, corners: 2,
    free_kicks: 2, passes: 141, successful_passes: 106, crosses: 0, interceptions: 29, tackles: 12, saves: 4,
  },
};

describe("AI extraction sanitising", () => {
  it("accepts the documented sample and keeps labels verbatim", () => {
    const r = sanitizeExtraction(SAMPLE);
    expect(r.left.goals).toBe(13);
    expect(r.left.possession_pct).toBe(57);
    expect(r.right.onscreen_label).toBe("Real Madrid");
    expect(r.right.offsides).toBe(0);
    expect(r.right.team_name).toBeNull();
    // Only the "13 goals is unusual" style warning, no errors.
    expect(hasErrors(r.issues)).toBe(false);
  });

  it("(9) keeps missing values as null and never as zero", () => {
    const r = sanitizeExtraction({
      left: { ...SAMPLE.left, crosses: null, saves: undefined, fouls: "" },
      right: { ...SAMPLE.right, goals: null },
    });
    expect(r.left.crosses).toBeNull();
    expect(r.left.saves).toBeNull();
    expect(r.left.fouls).toBeNull();
    expect(r.right.offsides).toBe(0);
    expect(r.right.goals).toBeNull();
    expect(r.issues.some((i) => i.side === "right" && i.field === "goals" && /couldn't be read/.test(i.message))).toBe(true);
  });

  it("(10) drops impossible values with a warning instead of guessing", () => {
    const r = sanitizeExtraction({
      left: { ...SAMPLE.left, shots: -3, passes: 2.5, tackles: "lots", possession: "57%" },
      right: { ...SAMPLE.right, saves: 9999 },
    });
    expect(r.left.shots).toBeNull();
    expect(r.left.passes).toBeNull();
    expect(r.left.tackles).toBeNull();
    expect(r.left.possession_pct).toBe(57);
    expect(r.right.saves).toBeNull();
    expect(r.issues.filter((i) => /isn't valid/.test(i.message))).toHaveLength(4);
  });

  it("(10) flags shots on target > shots and successful passes > passes", () => {
    const r = sanitizeExtraction({
      left: { ...SAMPLE.left, shots: 5, shots_on_target: 9 },
      right: { ...SAMPLE.right, passes: 100, successful_passes: 140 },
    });
    expect(r.issues.filter((i) => i.severity === "error").map((i) => i.field).sort()).toEqual([
      "shots_on_target",
      "successful_passes",
    ]);
  });

  it("warns when possession does not total 100", () => {
    const r = sanitizeExtraction({ left: { ...SAMPLE.left, possession: 60 }, right: SAMPLE.right });
    expect(r.issues.some((i) => i.side === "match" && i.field === "possession_pct")).toBe(true);
  });

  it("rejects a structurally wrong response", () => {
    expect(() => sanitizeExtraction({ home: {} })).toThrow();
  });
});

describe("form / API validation", () => {
  it("requires a score on each side", () => {
    const issues = validateSides(emptyDraftSide(), { ...emptyDraftSide(), goals: 1 });
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(1);
  });

  const side = (player: string, screen: "left" | "right", goals: number) => ({
    ...emptyDraftSide(),
    player_id: player,
    screen_side: screen,
    goals,
  });
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  it("accepts a valid payload", () => {
    const parsed = createMatchSchema.safeParse({
      upload_id: null,
      played_on: "2026-10-01",
      sides: [side(A, "left", 2), side(B, "right", 3)],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects the same player or the same side twice", () => {
    expect(
      createMatchSchema.safeParse({ upload_id: null, played_on: null, sides: [side(A, "left", 1), side(A, "right", 0)] })
        .success,
    ).toBe(false);
    expect(
      createMatchSchema.safeParse({ upload_id: null, played_on: null, sides: [side(A, "left", 1), side(B, "left", 0)] })
        .success,
    ).toBe(false);
  });

  it("(10) rejects invalid statistics server-side", () => {
    const bad = { ...side(A, "left", 1), shots: 2, shots_on_target: 3 };
    expect(
      createMatchSchema.safeParse({ upload_id: null, played_on: null, sides: [bad, side(B, "right", 0)] }).success,
    ).toBe(false);
    const negative = { ...side(A, "left", -1) };
    expect(
      createMatchSchema.safeParse({ upload_id: null, played_on: null, sides: [negative, side(B, "right", 0)] }).success,
    ).toBe(false);
  });
});
