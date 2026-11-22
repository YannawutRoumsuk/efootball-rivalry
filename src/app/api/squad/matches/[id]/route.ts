import { handle, ok, parseJson } from "@/lib/api/server";
import { squadMatchSchema } from "@/lib/domain/squad-schema";
import { asUser, requireRivalry, requireUuid } from "@/lib/server/context";
import { saveSquadMatch } from "@/lib/server/squad-save";
import { deleteScreenshot } from "@/lib/server/storage";

/** Corrects a saved 3v3 match: columns, players, numbers (group owner only; the RPC enforces it). */
export const PUT = handle(async (request: Request, context: RouteContext<"/api/squad/matches/[id]">) => {
  const id = requireUuid((await context.params).id);
  const { rivalry, roster, userId } = await requireRivalry({ needPlayers: true });
  const input = await parseJson(request, squadMatchSchema);
  await saveSquadMatch(userId, rivalry.id, roster, { ...input, upload_ids: [] }, id);
  return ok({ id });
});

/** Permanently deletes a 3v3 match and its screenshots (group owner only). */
export const DELETE = handle(async (_request: Request, context: RouteContext<"/api/squad/matches/[id]">) => {
  const id = requireUuid((await context.params).id);
  const { userId } = await requireRivalry();
  const rows = await asUser(
    userId,
    (tx) => tx<Array<{ deleted_path: string }>>`select deleted_path from public.delete_squad_match(${id}::uuid)`,
    "Couldn't delete the match.",
  );
  for (const { deleted_path } of rows) {
    await deleteScreenshot(deleted_path).catch((err: unknown) => console.error("[squad] screenshot not removed", deleted_path, err));
  }
  return ok({ id, deleted: true });
});
