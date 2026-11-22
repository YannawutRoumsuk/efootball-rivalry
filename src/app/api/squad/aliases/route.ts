import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/api/server";
import { asUser, requireRivalry } from "@/lib/server/context";

const schema = z.object({
  name: z.string().trim().min(1).max(60),
  player_id: z.uuid().nullable(),
});

/** Points an in-game name at a group member, or forgets it (group owner only; the RPC enforces it). */
export const POST = handle(async (request: Request) => {
  const { rivalry, userId } = await requireRivalry();
  const input = await parseJson(request, schema);
  await asUser(
    userId,
    (tx) => tx`select public.set_squad_alias(${rivalry.id}::uuid, ${input.name}, ${input.player_id}::uuid)`,
    "Couldn't save the name.",
  );
  return ok({ name: input.name, playerId: input.player_id });
});
