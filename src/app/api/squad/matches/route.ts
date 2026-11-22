import { handle, ok, parseJson } from "@/lib/api/server";
import { squadMatchSchema } from "@/lib/domain/squad-schema";
import { requireRivalry } from "@/lib/server/context";
import { saveSquadMatch } from "@/lib/server/squad-save";

/** Saves a reviewed 3v3 match (any member). */
export const POST = handle(async (request: Request) => {
  const { rivalry, roster, userId } = await requireRivalry({ needPlayers: true });
  const input = await parseJson(request, squadMatchSchema);
  const id = await saveSquadMatch(userId, rivalry.id, roster, input, null);
  return ok({ id }, 201);
});
