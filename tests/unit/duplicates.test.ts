import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  dhashFromGrayscale,
  findImageDuplicates,
  hammingDistanceHex,
  isSameMatchSameDay,
  MIN_COMPARED_STATS,
} from "@/lib/domain/duplicates";
import type { MatchSide } from "@/lib/domain/types";
import { PAIR, match, side } from "./fixtures";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("(8) duplicate image detection", () => {
  it("flags the exact same screenshot file (SHA-256)", () => {
    const dupes = findImageDuplicates({ imageHash: sha("img-1"), perceptualHash: null }, [
      { matchId: "m-1", imageHash: sha("img-1"), perceptualHash: null },
      { matchId: "m-2", imageHash: sha("img-2"), perceptualHash: null },
    ]);
    expect(dupes).toEqual([{ matchId: "m-1", reason: "identical_image", distance: 0 }]);
  });

  it("no longer flags merely similar-looking screenshots (every Full Time screen looks alike)", () => {
    const px = new Uint8Array(72).map((_, i) => (i * 37) % 256);
    const h = dhashFromGrayscale(px);
    const dupes = findImageDuplicates({ imageHash: sha("new"), perceptualHash: h }, [
      { matchId: "m-1", imageHash: sha("old"), perceptualHash: h },
    ]);
    expect(dupes).toEqual([]);
  });

  it("ignores uploads not attached to a match, and computes hamming distance", () => {
    expect(findImageDuplicates({ imageHash: sha("a"), perceptualHash: null }, [{ matchId: null, imageHash: sha("a"), perceptualHash: null }])).toEqual([]);
    expect(hammingDistanceHex("00", "ff")).toBe(8);
    expect(hammingDistanceHex("a0", "a1")).toBe(1);
  });
});

describe("same match uploaded twice on the same day", () => {
  // Fixture matches are recorded on 1 Jan 2026 (Bangkok); "now" is that same day.
  const TODAY = new Date("2026-01-01T05:00:00Z");
  const NEXT_DAY = new Date("2026-01-02T05:00:00Z");

  const full = {
    possession_pct: 54, shots: 6, shots_on_target: 5, fouls: 3, offsides: 1, corners: 0, free_kicks: 1,
    passes: 212, successful_passes: 184, crosses: 0, interceptions: 30, tackles: 15, saves: 3,
  };
  const other = {
    possession_pct: 46, shots: 7, shots_on_target: 5, fouls: 1, offsides: 1, corners: 1, free_kicks: 3,
    passes: 140, successful_passes: 97, crosses: 5, interceptions: 25, tackles: 18, saves: 0,
  };
  const existing = match(1, 5, 2, { a: { ...full, onscreen_label: "KynGian" }, b: { ...other, onscreen_label: "หีอุ่น" } });
  const candidate = (left: Partial<MatchSide> = {}, right: Partial<MatchSide> = {}) =>
    [
      side("a", "left", { goals: 5, ...full, onscreen_label: "KynGian", ...left }),
      side("b", "right", { goals: 2, ...other, onscreen_label: "หีอุ่น", ...right }),
    ] as const;

  it("flags it when names, score and every stat match", () => {
    expect(isSameMatchSameDay(candidate(), existing, TODAY)).toBe(true);
  });

  it("does not flag a match recorded on another day", () => {
    expect(isSameMatchSameDay(candidate(), existing, NEXT_DAY)).toBe(false);
  });

  it("does not flag different names or a different score", () => {
    expect(isSameMatchSameDay(candidate({ onscreen_label: "TheWinner" }), existing, TODAY)).toBe(false);
    expect(isSameMatchSameDay(candidate({ goals: 4 }), existing, TODAY)).toBe(false);
    expect(isSameMatchSameDay(candidate({ penalties: 4 }, { penalties: 3 }), existing, TODAY)).toBe(false);
  });

  it("does not flag when any single stat differs, checked in screen order", () => {
    for (const key of Object.keys(full) as Array<keyof typeof full>) {
      expect(isSameMatchSameDay(candidate({ [key]: full[key] + 1 }), existing, TODAY), key).toBe(false);
    }
    expect(isSameMatchSameDay(candidate({}, { saves: 9 }), existing, TODAY)).toBe(false);
  });

  it("compares by screen side, so the same screenshot saved with players swapped is still caught", () => {
    const swapped = candidate().map((s) => ({ ...s, player_id: s.player_id === PAIR.a.id ? PAIR.b.id : PAIR.a.id })) as unknown as ReturnType<typeof candidate>;
    expect(isSameMatchSameDay(swapped, existing, TODAY)).toBe(true);
  });

  it("skips names or stats that one of the two didn't record", () => {
    expect(isSameMatchSameDay(candidate({ onscreen_label: null, crosses: null }), existing, TODAY)).toBe(true);
  });

  it("never flags on a score alone (too few stats to be sure)", () => {
    const bare = match(2, 1, 0);
    const cand = [side("a", "left", { goals: 1 }), side("b", "right", { goals: 0 })] as const;
    expect(MIN_COMPARED_STATS).toBeGreaterThan(0);
    expect(isSameMatchSameDay(cand, bare, TODAY)).toBe(false);
  });
});
