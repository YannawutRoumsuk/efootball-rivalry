import { matchTime, type SquadMatch, type SquadStats } from "./squad";

export interface ScoringRow {
  playerId: string;
  games: number;
  goals: number;
  assists: number;
  /** Goals + assists. */
  contributions: number;
  /** Goal contributions per match played; null without games. */
  perGame: number | null;
  shots: number;
  /** Goals per shot (%) over matches where both were read; null without shots. */
  conversion: number | null;
  /** Most goals + assists in one match. */
  best: number;
}

const n = (v: number | null | undefined): number => v ?? 0;

function linesOf(matches: readonly SquadMatch[], playerId: string): SquadStats[] {
  return matches.flatMap((m) => m.players.filter((p) => p.player_id === playerId).map((p) => p.stats));
}

function rowFor(matches: readonly SquadMatch[], playerId: string): ScoringRow {
  const lines = linesOf(matches, playerId);
  const goals = lines.reduce((sum, s) => sum + n(s.goals), 0);
  const assists = lines.reduce((sum, s) => sum + n(s.assists), 0);
  const shots = lines.reduce((sum, s) => sum + n(s.shots), 0);
  const both = lines.filter((s) => s.goals != null && s.shots != null);
  const shotsWithGoals = both.reduce((sum, s) => sum + s.shots!, 0);
  const goalsWithShots = both.reduce((sum, s) => sum + s.goals!, 0);
  const contributions = goals + assists;
  return {
    playerId,
    games: lines.length,
    goals,
    assists,
    contributions,
    perGame: lines.length > 0 ? contributions / lines.length : null,
    shots,
    conversion: shotsWithGoals > 0 ? (goalsWithShots / shotsWithGoals) * 100 : null,
    best: Math.max(0, ...lines.map((s) => n(s.goals) + n(s.assists))),
  };
}

/** Career goals and assists of each player in 3v3, most goal contributions first. */
export function scoringBoard(matches: readonly SquadMatch[], playerIds: readonly string[]): ScoringRow[] {
  return playerIds
    .map((id) => rowFor(matches, id))
    .sort((a, b) => b.contributions - a.contributions || b.goals - a.goals || a.games - b.games);
}

/** Running goals + assists per player after each match, oldest first. */
export function scoringTimeline(
  matches: readonly SquadMatch[],
  playerIds: readonly string[],
): Array<{ label: string; values: Record<string, number> }> {
  const ordered = [...matches].sort((a, b) => matchTime(a) - matchTime(b));
  const running: Record<string, number> = Object.fromEntries(playerIds.map((id) => [id, 0]));
  return ordered.map((m, i) => {
    for (const id of playerIds) {
      const s = m.players.find((p) => p.player_id === id)?.stats;
      running[id] += s ? n(s.goals) + n(s.assists) : 0;
    }
    return { label: `#${i + 1}`, values: { ...running } };
  });
}
