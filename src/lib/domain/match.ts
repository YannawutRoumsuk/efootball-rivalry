import type { Match, MatchSide, Outcome, PlayerKey, PlayerPair } from "./types";

/** A match seen from the rivalry's fixed Player A / Player B perspective. */
export interface PerspectiveMatch {
  match: Match;
  a: MatchSide;
  b: MatchSide;
  winner: PlayerKey | "draw";
}

export class PlayerMappingError extends Error {
  constructor(matchId: string) {
    super(`Match ${matchId} does not contain both rivalry players`);
    this.name = "PlayerMappingError";
  }
}

/**
 * Resolves which side belongs to which real player using player IDs only —
 * never screen position, on-screen label or team name.
 */
export function toPerspective(match: Match, pair: PlayerPair): PerspectiveMatch {
  const a = match.sides.find((s) => s.player_id === pair.a.id);
  const b = match.sides.find((s) => s.player_id === pair.b.id);
  if (!a || !b) throw new PlayerMappingError(match.id);

  const winner: PerspectiveMatch["winner"] =
    a.goals > b.goals ? "a" : b.goals > a.goals ? "b" : "draw";
  return { match, a, b, winner };
}

/** Winning player's ID, or null for a draw. */
export function winnerPlayerId(match: Match): string | null {
  const [first, second] = match.sides;
  if (first.goals === second.goals) return null;
  return first.goals > second.goals ? first.player_id : second.player_id;
}

export function outcomeFor(pm: PerspectiveMatch, key: PlayerKey): Outcome {
  if (pm.winner === "draw") return "D";
  return pm.winner === key ? "W" : "L";
}

export function sideFor(pm: PerspectiveMatch, key: PlayerKey): MatchSide {
  return key === "a" ? pm.a : pm.b;
}

export function opponentOf(key: PlayerKey): PlayerKey {
  return key === "a" ? "b" : "a";
}

export function sideOnScreen(match: Match, side: "left" | "right"): MatchSide {
  const found = match.sides.find((s) => s.screen_side === side);
  if (!found) throw new Error(`Match ${match.id} has no ${side} side`);
  return found;
}

/** Stable chronological order: the rivalry's match sequence, never upload time. */
export function sortChronologically<T extends { match_no: number }>(matches: readonly T[]): T[] {
  return [...matches].sort((x, y) => x.match_no - y.match_no);
}

/** Official statistics only count confirmed matches. */
export function officialMatches(matches: readonly Match[]): Match[] {
  return sortChronologically(matches.filter((m) => m.status === "confirmed"));
}

export function toPerspectives(matches: readonly Match[], pair: PlayerPair): PerspectiveMatch[] {
  return officialMatches(matches).map((m) => toPerspective(m, pair));
}
