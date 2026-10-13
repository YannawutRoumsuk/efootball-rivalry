import { ApiError } from "@/lib/api/envelope";
import { handle, ok, parseJson } from "@/lib/api/server";
import { toPerspectives } from "@/lib/domain/match";
import { detectNewRecords, type NewRecord } from "@/lib/domain/records";
import { createMatchSchema, playedOnToTimestamp } from "@/lib/domain/validation";
import { jsonb } from "@/lib/db";
import { asUser, loadMatches, requireRivalry } from "@/lib/server/context";
import { findDuplicates, loadUploadFingerprint } from "@/lib/server/duplicates";

/**
 * Step 6: saves a reviewed match. The duplicate check and create_match run in
 * the same transaction (the RPC locks the rivalry row), so match, both sides,
 * screenshot link and audit event are saved atomically — or not at all.
 */
export const POST = handle(async (request: Request) => {
  const { rivalry, pair, userId } = await requireRivalry({ needPair: true });
  const input = await parseJson(request, createMatchSchema);
  const playedAt = playedOnToTimestamp(input.played_on);

  const memberIds = new Set([pair!.a.id, pair!.b.id]);
  if (!input.sides.every((s) => memberIds.has(s.player_id))) {
    throw new ApiError("PLAYER_NOT_IN_RIVALRY", "Both players must be members of this rivalry.", 400);
  }

  const saved = await asUser(
    userId,
    async (tx) => {
      // Serialise saves per rivalry so two taps can't both pass the duplicate check.
      await tx`select id from public.rivalries where id = ${rivalry.id} for update`;
      const before = await loadMatches(tx, rivalry.id);
      if (!input.acknowledge_duplicates) {
        const image = input.upload_id ? await loadUploadFingerprint(tx, input.upload_id) : null;
        const duplicates = await findDuplicates(tx, rivalry.id, before, { image, sides: input.sides, playedAt });
        if (duplicates.length > 0) {
          throw new ApiError("POSSIBLE_DUPLICATE", "This looks like a match that was already saved.", 409, duplicates);
        }
      }
      const [created] = await tx<Array<{ match_id: string; match_no: number }>>`
        select * from public.create_match(
          ${rivalry.id}::uuid, ${jsonb(tx, input.sides)}::jsonb, ${playedAt}::timestamptz, ${input.upload_id}::uuid, ${input.insert_at}::int
        )`;

      // Extras never fail an already-valid save: a savepoint keeps a failed
      // query here from aborting the outer transaction.
      let records: NewRecord[] = [];
      try {
        const after = await tx.savepoint((sp) => loadMatches(sp, rivalry.id));
        records = detectNewRecords(toPerspectives(before, pair!), toPerspectives(after, pair!), created.match_id, pair!);
      } catch (err) {
        console.error("[matches] record detection failed", err);
      }
      return { ...created, records };
    },
    "Couldn't save the match.",
  );

  return ok({ matchId: saved.match_id, matchNo: saved.match_no, records: saved.records }, 201);
});
