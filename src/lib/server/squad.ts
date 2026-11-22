import "server-only";

import type { Tx } from "@/lib/db";
import type { RosterPlayer } from "@/lib/domain/league";
import { defaultAliases, matchAlias, type NameAlias, type SquadMatch } from "@/lib/domain/squad";

interface Row {
  match: Omit<SquadMatch, "players"> & { players: SquadMatch["players"] | null };
}

const MATCH_JSON = (tx: Tx) => tx`
  jsonb_build_object(
    'id', m.id, 'played_at', m.played_at, 'team_name', m.team_name,
    'goals_for', m.goals_for, 'goals_against', m.goals_against, 'created_at', m.created_at,
    'players', (
      select jsonb_agg(jsonb_build_object('slot', p.slot, 'player_id', p.player_id, 'ingame_name', p.ingame_name, 'stats', p.stats) order by p.slot)
      from public.squad_match_players p where p.squad_match_id = m.id
    )
  )`;

const toMatch = ({ match }: Row): SquadMatch => ({ ...match, players: match.players ?? [] });

/** Every 3v3 match of the group, newest first. */
export async function loadSquadMatches(tx: Tx, rivalryId: string): Promise<SquadMatch[]> {
  const rows = await tx<Row[]>`
    select ${MATCH_JSON(tx)} as match from public.squad_matches m
    where m.rivalry_id = ${rivalryId}
    order by coalesce(m.played_at, m.created_at) desc, m.created_at desc`;
  return rows.map(toMatch);
}

export async function loadSquadMatch(tx: Tx, id: string): Promise<SquadMatch | null> {
  const [row] = await tx<Row[]>`select ${MATCH_JSON(tx)} as match from public.squad_matches m where m.id = ${id}`;
  return row ? toMatch(row) : null;
}

export async function loadSquadScreenshots(tx: Tx, matchId: string): Promise<string[]> {
  const rows = await tx<Array<{ id: string }>>`
    select id from public.squad_uploads where squad_match_id = ${matchId} order by created_at`;
  return rows.map((r) => r.id);
}

/** Learned in-game names first, then the built-in defaults for names nobody has assigned yet. */
export async function loadAliases(tx: Tx, rivalryId: string, roster: readonly RosterPlayer[]): Promise<NameAlias[]> {
  const learned = await tx<NameAlias[]>`
    select ingame_name as name, player_id as "playerId" from public.squad_aliases where rivalry_id = ${rivalryId}`;
  const defaults = defaultAliases(roster).filter((d) => !matchAlias(d.name, learned));
  return [...learned, ...defaults];
}
