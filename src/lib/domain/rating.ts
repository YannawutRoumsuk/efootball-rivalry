import { computeElo, type EloMatchChange } from "./elo";
import { seasonOf, type SeasonKey } from "./seasons";
import type { Match } from "./types";

/**
 * Each match's Elo change within its own season (ratings restart every
 * season), keyed by match id. Only confirmed matches appear.
 */
export function seasonalEloChanges(matches: readonly Match[], playerIds: readonly string[], epoch: string | null): Map<string, EloMatchChange> {
  const bySeason = new Map<SeasonKey, Match[]>();
  for (const m of matches) {
    const key = seasonOf(m, epoch);
    const group = bySeason.get(key);
    if (group) group.push(m);
    else bySeason.set(key, [m]);
  }
  const out = new Map<string, EloMatchChange>();
  for (const group of bySeason.values()) {
    for (const [id, change] of computeElo(group, playerIds).byMatch) out.set(id, change);
  }
  return out;
}

/** The change as shown on screen: rounded ratings, so before + change = after. */
export function displayedDelta(change: EloMatchChange, playerId: string): number {
  const before = change.before[playerId];
  return Math.round(before + change.delta[playerId]) - Math.round(before);
}
