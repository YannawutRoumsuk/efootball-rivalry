import { handle, ok, parseJson } from "@/lib/api/server";
import { moveMatchSchema } from "@/lib/domain/validation";
import { asUser, requireRivalry, requireUuid } from "@/lib/server/context";

/** Changes a match's position in the rivalry sequence (historical ordering). */
export const POST = handle(async (request: Request, context: RouteContext<"/api/matches/[id]/move">) => {
  const id = requireUuid((await context.params).id);
  const { userId } = await requireRivalry();
  const input = await parseJson(request, moveMatchSchema);

  const [row] = await asUser(
    userId,
    (tx) => tx<Array<{ match_no: number }>>`select public.move_match(${id}::uuid, ${input.match_no}::int) as match_no`,
    "Couldn't move the match.",
  );
  return ok({ matchNo: row.match_no });
});
