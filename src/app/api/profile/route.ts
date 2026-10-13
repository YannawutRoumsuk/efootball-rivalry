import { z } from "zod";
import { handle, ok, parseJson } from "@/lib/api/server";
import { asUser, requireUser } from "@/lib/server/context";

const schema = z.object({ display_name: z.string().trim().min(1, "Name can't be empty.").max(40) });

export const PATCH = handle(async (request: Request) => {
  const { userId } = await requireUser();
  const { display_name } = await parseJson(request, schema);
  await asUser(
    userId,
    (tx) => tx`update public.profiles set display_name = ${display_name} where id = ${userId}`,
    "Couldn't update your profile.",
  );
  return ok({ display_name });
});
