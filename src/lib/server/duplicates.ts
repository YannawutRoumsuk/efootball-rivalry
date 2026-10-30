import "server-only";

import type { Tx } from "@/lib/db";
import {
  findImageDuplicates,
  isSameMatchSameDay,
  type DuplicateCandidate,
  type UploadFingerprint,
} from "@/lib/domain/duplicates";
import type { Match, MatchSide } from "@/lib/domain/types";
import type { SideInput } from "@/lib/domain/validation";

export type ImageFingerprint = { imageHash: string; perceptualHash: string | null };

export async function loadUploadFingerprints(tx: Tx, rivalryId: string): Promise<UploadFingerprint[]> {
  const rows = await tx<Array<{ match_id: string; image_hash: string; perceptual_hash: string | null }>>`
    select match_id, image_hash, perceptual_hash from public.match_uploads
    where rivalry_id = ${rivalryId} and match_id is not null`;
  return rows.map((u) => ({ matchId: u.match_id, imageHash: u.image_hash, perceptualHash: u.perceptual_hash }));
}

export async function loadUploadFingerprint(tx: Tx, uploadId: string): Promise<ImageFingerprint | null> {
  const [row] = await tx<Array<{ image_hash: string; perceptual_hash: string | null }>>`
    select image_hash, perceptual_hash from public.match_uploads where id = ${uploadId}`;
  return row ? { imageHash: row.image_hash, perceptualHash: row.perceptual_hash } : null;
}

const IMAGE_DETAIL = { identical_image: "This exact screenshot was already used" } as const;

export function imageDuplicateCandidates(
  target: ImageFingerprint,
  uploads: UploadFingerprint[],
  matches: readonly Match[],
): DuplicateCandidate[] {
  const byId = new Map(matches.map((m) => [m.id, m]));
  return findImageDuplicates(target, uploads).flatMap((d) => {
    const m = byId.get(d.matchId);
    return m ? [{ matchId: m.id, matchNo: m.match_no, status: m.status, reason: d.reason, detail: IMAGE_DETAIL[d.reason] }] : [];
  });
}

/**
 * Duplicate check against saved (non-void) matches: the exact same screenshot
 * file, or a match recorded today with the same names, score and every stat.
 */
export async function findDuplicates(
  tx: Tx,
  rivalryId: string,
  matches: readonly Match[],
  input: {
    image: ImageFingerprint | null;
    sides: readonly [SideInput, SideInput];
    playedAt: string | null;
    excludeMatchId?: string | null;
  },
  now: Date = new Date(),
): Promise<DuplicateCandidate[]> {
  const candidates = new Map<string, DuplicateCandidate>();
  const live = matches.filter((m) => m.status !== "void" && m.id !== input.excludeMatchId);

  if (input.image) {
    const uploads = await loadUploadFingerprints(tx, rivalryId);
    for (const c of imageDuplicateCandidates(input.image, uploads, live)) candidates.set(c.matchId, c);
  }

  const sides = input.sides as unknown as readonly [MatchSide, MatchSide];
  for (const m of live) {
    if (candidates.has(m.id)) continue;
    if (isSameMatchSameDay(sides, m, now)) {
      candidates.set(m.id, {
        matchId: m.id,
        matchNo: m.match_no,
        status: m.status,
        reason: "same_stats",
        detail: "Recorded today with the same names, score and every statistic",
      });
    }
  }
  return [...candidates.values()].sort((x, y) => x.matchNo - y.matchNo);
}
