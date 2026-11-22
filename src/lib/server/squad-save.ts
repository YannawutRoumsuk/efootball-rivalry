import "server-only";

import { ApiError } from "@/lib/api/envelope";
import { jsonb } from "@/lib/db";
import type { RosterPlayer } from "@/lib/domain/league";
import { validateSquadColumns } from "@/lib/domain/squad";
import type { SquadMatchInput } from "@/lib/domain/squad-schema";
import { asUser } from "./context";

/** Validates a reviewed 3v3 draft and saves it through save_squad_match (creates when matchId is null). */
export async function saveSquadMatch(
  userId: string,
  rivalryId: string,
  roster: readonly RosterPlayer[],
  input: SquadMatchInput,
  matchId: string | null,
): Promise<string> {
  const members = new Set(roster.map((p) => p.id));
  if (input.players.some((p) => p.player_id && !members.has(p.player_id))) {
    throw new ApiError("PLAYER_NOT_IN_RIVALRY", "Every player must be a member of this group.", 400);
  }
  const issues = validateSquadColumns(input.players.map((p) => ({ slot: p.slot, playerId: p.player_id, stats: p.stats })));
  if (issues.length > 0) throw new ApiError("VALIDATION", issues[0].message, 400, issues);

  const match = {
    played_at: input.played_at,
    team_name: input.team_name,
    opponent_name: input.opponent_name,
    goals_for: input.goals_for,
    goals_against: input.goals_against,
    team_stats: input.team_stats,
  };
  const [{ id }] = await asUser(
    userId,
    (tx) => tx<Array<{ id: string }>>`
      select public.save_squad_match(
        ${rivalryId}::uuid, ${matchId}::uuid, ${jsonb(tx, match)}::jsonb, ${jsonb(tx, input.players)}::jsonb, ${input.upload_ids}::uuid[]
      ) as id`,
    "Couldn't save the match.",
  );
  return id;
}
