import { z } from "zod";
import { ApiError } from "@/lib/api/envelope";
import { handle, ok, parseJson } from "@/lib/api/server";
import { asUser, requireRivalry, requireUser } from "@/lib/server/context";

const nameSchema = z.object({ name: z.string().trim().min(1, "Give the room a name.").max(60) });

/** Creates a private group; the creator takes seat 1. (PIN login provisions this automatically.) */
export const POST = handle(async (request: Request) => {
  const { rivalry, userId } = await requireUser();
  if (rivalry) throw new ApiError("ALREADY_IN_RIVALRY", "You are already in a rivalry room.", 409);
  const { name } = await parseJson(request, nameSchema);

  const [row] = await asUser(
    userId,
    (tx) => tx<Array<{ id: string }>>`select public.create_rivalry(${name}::text) as id`,
    "Couldn't create the room.",
  );
  return ok({ rivalryId: row.id }, 201);
});

export const PATCH = handle(async (request: Request) => {
  const { rivalry, userId } = await requireRivalry();
  const { name } = await parseJson(request, nameSchema);
  await asUser(userId, (tx) => tx`update public.rivalries set name = ${name} where id = ${rivalry.id}`, "Couldn't rename the room.");
  return ok({ name });
});
