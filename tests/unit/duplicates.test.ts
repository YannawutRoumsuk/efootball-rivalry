import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  dhashFromGrayscale,
  findImageDuplicates,
  hammingDistanceHex,
  isLikelySameMatch,
} from "@/lib/domain/duplicates";
import { PAIR, match, side } from "./fixtures";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function gradient(seed: number): Uint8Array {
  const px = new Uint8Array(72);
  for (let i = 0; i < 72; i += 1) px[i] = (i * 37 + seed * 11) % 256;
  return px;
}

describe("(8) duplicate image detection", () => {
  it("flags an identical SHA-256 hash", () => {
    const dupes = findImageDuplicates({ imageHash: sha("img-1"), perceptualHash: null }, [
      { matchId: "m-1", imageHash: sha("img-1"), perceptualHash: null },
      { matchId: "m-2", imageHash: sha("img-2"), perceptualHash: null },
    ]);
    expect(dupes).toEqual([{ matchId: "m-1", reason: "identical_image", distance: 0 }]);
  });

  it("flags a near-identical perceptual hash (re-saved / re-compressed screenshot)", () => {
    const base = gradient(1);
    const tweaked = Uint8Array.from(base);
    tweaked[10] = (tweaked[10] + 200) % 256; // small local change
    const h1 = dhashFromGrayscale(base);
    const h2 = dhashFromGrayscale(tweaked);
    expect(h1).toMatch(/^[0-9a-f]{16}$/);
    expect(hammingDistanceHex(h1, h2)).toBeLessThanOrEqual(2);

    const dupes = findImageDuplicates({ imageHash: sha("new"), perceptualHash: h2 }, [
      { matchId: "m-1", imageHash: sha("old"), perceptualHash: h1 },
    ]);
    expect(dupes[0]).toMatchObject({ matchId: "m-1", reason: "similar_image" });
  });

  it("does not flag different screenshots or uploads not attached to a match", () => {
    const dupes = findImageDuplicates({ imageHash: sha("a"), perceptualHash: "0000000000000000" }, [
      { matchId: "m-1", imageHash: sha("b"), perceptualHash: "ffffffffffffffff" },
      { matchId: null, imageHash: sha("a"), perceptualHash: "0000000000000000" },
    ]);
    expect(dupes).toEqual([]);
  });

  it("computes hamming distance", () => {
    expect(hammingDistanceHex("00", "ff")).toBe(8);
    expect(hammingDistanceHex("a0", "a1")).toBe(1);
  });
});

describe("match-data duplicate detection", () => {
  const stats = { shots: 22, shots_on_target: 17, passes: 222, successful_passes: 187, fouls: 2, tackles: 19 };
  const existing = match(1, 13, 0, { a: stats, b: { shots: 5, shots_on_target: 2 } });

  it("flags the same score with the same detailed stats", () => {
    const cand = [side("a", "left", { goals: 13, ...stats }), side("b", "right", { goals: 0, shots: 5, shots_on_target: 2 })] as const;
    expect(isLikelySameMatch(cand, null, existing)).toBe(true);
  });

  it("does NOT flag a different match that merely has the same score", () => {
    const cand = [
      side("a", "left", { goals: 13, shots: 30, shots_on_target: 20, passes: 300, successful_passes: 250, fouls: 1, tackles: 8 }),
      side("b", "right", { goals: 0, shots: 3, shots_on_target: 1 }),
    ] as const;
    expect(isLikelySameMatch(cand, null, existing)).toBe(false);
  });

  it("does NOT flag when goals belong to the other player", () => {
    const cand = [side("b", "left", { goals: 13, ...stats }), side("a", "right", { goals: 0 })] as const;
    expect(isLikelySameMatch(cand, null, existing)).toBe(false);
  });

  it("with no stats, needs the same labels and date to flag", () => {
    const bare = match(2, 2, 1, { playedAt: "2026-10-01T12:00:00.000Z", a: { onscreen_label: "KynGian" }, b: { onscreen_label: "Real Madrid" } });
    const cand = [
      side("a", "left", { goals: 2, onscreen_label: "kyngian" }),
      side("b", "right", { goals: 1, onscreen_label: "Real Madrid" }),
    ] as const;
    expect(isLikelySameMatch(cand, "2026-10-01T12:00:00.000Z", bare)).toBe(true);
    expect(isLikelySameMatch(cand, "2026-10-02T12:00:00.000Z", bare)).toBe(false);
    expect(PAIR.a.id).toBe(cand[0].player_id);
  });
});
