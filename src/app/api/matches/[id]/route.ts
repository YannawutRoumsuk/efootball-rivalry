import { handle, ok, parseJson } from "@/lib/api/server";
import { playedOnToTimestamp, updateMatchSchema } from "@/lib/domain/validation";
import { jsonb } from "@/lib/db";
import { asUser, requireRivalry, requireUuid } from "@/lib/server/context";

/** Corrects a saved match. The RPC records before/after data in the audit log. */
export const PATCH = handle(async (request: Request, context: RouteContext<"/api/matches/[id]">) => {
  const id = requireUuid((await context.params).id);
  const { userId } = await requireRivalry({ needPlayers: true });
  const input = await parseJson(request, updateMatchSchema);

  await asUser(
    userId,
    (tx) => tx`select public.update_match(
      ${id}::uuid, ${jsonb(tx, input.sides)}::jsonb, ${playedOnToTimestamp(input.played_on)}::timestamptz, ${input.note}::text)`,
    "Couldn't update the match.",
  );
  return ok({ matchId: id });
});
