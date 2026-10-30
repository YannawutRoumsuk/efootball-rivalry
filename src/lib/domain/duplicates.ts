import { normalizeLabel } from "@/lib/ocr/labels";
import { STAT_KEYS, type Match, type ScreenSide, type SideStats } from "./types";

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

export type DuplicateReason = "identical_image" | "same_stats";

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

/**
 * Image-level duplicates: only the exact same file (SHA-256). Look-alike
 * screenshots are NOT flagged: every Full Time screen has the same layout, so
 * different matches between the same teams look nearly identical. Those are
 * told apart by their stats instead (isSameMatchSameDay).
 */
export function findImageDuplicates(
  target: { imageHash: string; perceptualHash: string | null },
  existing: readonly UploadFingerprint[],
): Array<{ matchId: string; reason: "identical_image"; distance: number }> {
  const out = new Map<string, { matchId: string; reason: "identical_image"; distance: number }>();
  for (const up of existing) {
    if (up.matchId && up.imageHash === target.imageHash) {
      out.set(up.matchId, { matchId: up.matchId, reason: "identical_image", distance: 0 });
    }
  }
  return [...out.values()];
}

interface CandidateSide extends SideStats {
  player_id: string;
  screen_side: ScreenSide;
  onscreen_label: string | null;
  team_name: string | null;
  penalties?: number | null;
}

/** A real Full Time screenshot has 26 stat values; fewer than this compared and we can't be sure. */
export const MIN_COMPARED_STATS = 8;

const BANGKOK_OFFSET_MS = 7 * 3_600_000;
const bangkokDay = (d: Date) => new Date(d.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);

/** Both recorded → must match (ignoring case, spaces, punctuation); either missing → no evidence. */
function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a ? normalizeLabel(a) : "";
  const y = b ? normalizeLabel(b) : "";
  return !x || !y || x === y;
}

/**
 * "Was this exact match already uploaded today?" Only matches recorded the
 * same day (Bangkok time) as `now` are considered. Sides are compared by
 * screen position (left with left), not by which player was picked, so the
 * same screenshot saved with the players swapped is still caught.
 *
 *   1. names on screen (on-screen label and team) and the score, penalties
 *      included, must be the same on both sides;
 *   2. then every stat, in screen order — possession, shots, shots on target,
 *      fouls, … saves — must be identical on both sides.
 *
 * Values missing on either record are skipped; at least MIN_COMPARED_STATS
 * must actually be compared, so a bare score never counts as a duplicate.
 */
export function isSameMatchSameDay(candidate: readonly [CandidateSide, CandidateSide], existing: Match, now: Date): boolean {
  if (bangkokDay(new Date(existing.created_at)) !== bangkokDay(now)) return false;

  const pairs = (["left", "right"] as const).map((pos) => {
    const mine = candidate.find((s) => s.screen_side === pos);
    const theirs = existing.sides.find((s) => s.screen_side === pos);
    return mine && theirs ? ([mine, theirs] as const) : null;
  });
  if (pairs.some((p) => p === null)) return false;
  const sides = pairs as Array<readonly [CandidateSide, Match["sides"][number]]>;

  // 1) Names and score first.
  for (const [mine, theirs] of sides) {
    if (!sameName(mine.onscreen_label, theirs.onscreen_label) || !sameName(mine.team_name, theirs.team_name)) return false;
    if (mine.goals !== theirs.goals || (mine.penalties ?? null) !== (theirs.penalties ?? null)) return false;
  }

  // 2) Then each stat in screen order; the first difference means a different match.
  let compared = 0;
  for (const key of STAT_KEYS) {
    for (const [mine, theirs] of sides) {
      const a = mine[key];
      const b = theirs[key];
      if (a === null || b === null) continue;
      if (Number(a) !== Number(b)) return false;
      compared += 1;
    }
  }
  return compared >= MIN_COMPARED_STATS;
}
