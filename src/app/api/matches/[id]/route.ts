import { handle, ok, parseJson } from "@/lib/api/server";
import { playedOnToTimestamp, updateMatchSchema } from "@/lib/domain/validation";
import { jsonb } from "@/lib/db";
import { asUser, requireRivalry, requireUuid } from "@/lib/server/context";
import { deleteScreenshot } from "@/lib/server/storage";

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

/**
 * Permanently deletes a match (group owner only; the RPC enforces it). Nothing
 * is cached, so every table, rating and stat is recalculated without it on the
 * next page load. The screenshot files go after the rows are gone.
 */
export const DELETE = handle(async (_request: Request, context: RouteContext<"/api/matches/[id]">) => {
  const id = requireUuid((await context.params).id);
  const { userId } = await requireRivalry();
  const rows = await asUser(
    userId,
    (tx) => tx<Array<{ deleted_path: string }>>`select deleted_path from public.delete_match(${id}::uuid)`,
    "Couldn't delete the match.",
  );
  for (const { deleted_path } of rows) {
    await deleteScreenshot(deleted_path).catch((err) => console.error("[delete] screenshot not removed", deleted_path, err));
  }
  return ok({ matchId: id, deleted: true });
});
