import { handle, ok, parseJson } from "@/lib/api/server";
import { duplicateCheckSchema, playedOnToTimestamp } from "@/lib/domain/validation";
import { asUser, loadMatches, requireRivalry } from "@/lib/server/context";
import { findDuplicates, loadUploadFingerprint } from "@/lib/server/duplicates";

/** Step 5: duplicate warnings before saving (image hashes + match data). */
export const POST = handle(async (request: Request) => {
  const { rivalry, userId } = await requireRivalry({ needPlayers: true });
  const input = await parseJson(request, duplicateCheckSchema);

  const duplicates = await asUser(userId, async (tx) => {
    const image = input.upload_id ? await loadUploadFingerprint(tx, input.upload_id) : null;
    const matches = await loadMatches(tx, rivalry.id);
    return findDuplicates(tx, rivalry.id, matches, {
      image,
      sides: input.sides,
      playedAt: playedOnToTimestamp(input.played_on),
      excludeMatchId: input.exclude_match_id,
    });
  });
  return ok({ duplicates });
});
