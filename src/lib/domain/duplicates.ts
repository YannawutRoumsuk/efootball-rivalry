import { STAT_KEYS, type Match, type SideStats } from "./types";

/** dHash distance at or below this is treated as "probably the same screenshot". */
export const SIMILAR_IMAGE_MAX_DISTANCE = 6;

/**
 * Difference hash: compares each pixel with its right neighbour on a
 * (width × height) greyscale thumbnail. 9×8 yields 64 bits / 16 hex chars.
 */
export function dhashFromGrayscale(pixels: Uint8Array, width = 9, height = 8): string {
  if (pixels.length !== width * height) {
    throw new Error(`Expected ${width * height} pixels, got ${pixels.length}`);
  }
  let bits = "";
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      bits += pixels[y * width + x] > pixels[y * width + x + 1] ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) throw new Error("Hashes must have equal length");
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

export type DuplicateReason = "identical_image" | "similar_image" | "same_stats";

export interface DuplicateCandidate {
  matchId: string;
  matchNo: number;
  status: Match["status"];
  reason: DuplicateReason;
  detail: string;
}

export interface UploadFingerprint {
  matchId: string | null;
  imageHash: string;
  perceptualHash: string | null;
}

/** Image-level duplicates: exact SHA-256 match, or near-identical dHash. */
export function findImageDuplicates(
  target: { imageHash: string; perceptualHash: string | null },
  existing: readonly UploadFingerprint[],
): Array<{ matchId: string; reason: "identical_image" | "similar_image"; distance: number }> {
  const out = new Map<string, { matchId: string; reason: "identical_image" | "similar_image"; distance: number }>();
  for (const up of existing) {
    if (!up.matchId) continue;
    if (up.imageHash === target.imageHash) {
      out.set(up.matchId, { matchId: up.matchId, reason: "identical_image", distance: 0 });
      continue;
    }
    if (target.perceptualHash && up.perceptualHash && !out.has(up.matchId)) {
      const distance = hammingDistanceHex(target.perceptualHash, up.perceptualHash);
      if (distance <= SIMILAR_IMAGE_MAX_DISTANCE) {
        out.set(up.matchId, { matchId: up.matchId, reason: "similar_image", distance });
      }
    }
  }
  return [...out.values()];
}

interface CandidateSide extends SideStats {
  player_id: string;
  onscreen_label: string | null;
}

/**
 * Data-level duplicate check. A shared score alone is never enough: the same
 * players must have the same goals AND most reported stats must be identical
 * (or, with no stats to compare, the same labels and date).
 */
export function isLikelySameMatch(
  candidate: readonly [CandidateSide, CandidateSide],
  candidatePlayedAt: string | null,
  existing: Match,
): boolean {
  for (const side of candidate) {
    const other = existing.sides.find((s) => s.player_id === side.player_id);
    if (!other || other.goals !== side.goals) return false;
  }

  let compared = 0;
  let equal = 0;
  for (const side of candidate) {
    const other = existing.sides.find((s) => s.player_id === side.player_id)!;
    for (const key of STAT_KEYS) {
      if (side[key] === null || other[key] === null) continue;
      compared += 1;
      if (Number(side[key]) === Number(other[key])) equal += 1;
    }
  }

  if (compared >= 6) return equal / compared >= 0.9;

  const sameLabels = candidate.every((side) => {
    const other = existing.sides.find((s) => s.player_id === side.player_id)!;
    return (
      !!side.onscreen_label &&
      side.onscreen_label.trim().toLowerCase() === (other.onscreen_label ?? "").trim().toLowerCase()
    );
  });
  const sameDay =
    !!candidatePlayedAt && !!existing.played_at && candidatePlayedAt.slice(0, 10) === existing.played_at.slice(0, 10);
  return sameLabels && sameDay;
}
