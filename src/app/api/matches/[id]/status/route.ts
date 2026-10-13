import { handle, ok, parseJson } from "@/lib/api/server";
import { matchStatusSchema } from "@/lib/domain/validation";
import { asUser, requireRivalry, requireUuid } from "@/lib/server/context";

/** Dispute / resolve / void / restore. Matches are never hard-deleted. */
export const POST = handle(async (request: Request, context: RouteContext<"/api/matches/[id]/status">) => {
  const id = requireUuid((await context.params).id);
  const { userId } = await requireRivalry();
  const input = await parseJson(request, matchStatusSchema);

  const [row] = await asUser(
    userId,
    (tx) => tx<Array<{ status: string }>>`select public.set_match_status(${id}::uuid, ${input.action}::text, ${input.note}::text) as status`,
    "Couldn't change the match status.",
  );
  return ok({ status: row.status });
});
