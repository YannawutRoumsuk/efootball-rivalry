import { hasShootout, officialMatches, sideWinner } from "./match";
import type { Match, MatchSide, Outcome } from "./types";

/**
 * Elo rating, adapted for a small friends' league.
 *
 *   expected  E = 1 / (1 + 10^((opponent − me) / 400))
 *   score     S = 75% result (win 1, draw ½, loss 0) + 25% in-game performance
 *   change    Δ = K × (S − E), zero-sum between the two players
 *
 * Performance is the player's share of the match's key stats, so a close,
 * well-played defeat costs less than a thrashing. The result still dominates:
 * a win always scores at least 0.75 and a loss at most 0.25. The page at
 * /guide/elo explains this with worked examples built from these functions.
 */
export const ELO = {
  start: 1000,
  k: 32,
  /** Share of the match score that comes from the result; the rest is performance. */
  resultWeight: 0.75,
  /** Ratings stay "provisional" until a player has this many games in the season. */
  provisionalGames: 5,
  /** A winner never loses rating, even when outplayed; they gain at least this much. */
  minWinnerGain: 1,
  /**
   * Result value of winning a penalty shoot-out (the loser gets 1 − this):
   * a win, but less convincing than winning in normal time.
   */
  shootoutWin: 0.75,
} as const;

/** Weights of each stat inside the performance share; missing stats are skipped and the rest rescaled. */
export const PERFORMANCE_WEIGHTS = {
  goals: 0.35,
  shots_on_target: 0.25,
  possession: 0.15,
  pass_accuracy: 0.15,
  shots: 0.1,
} as const;

export type PerformanceKey = keyof typeof PERFORMANCE_WEIGHTS;

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

/** a / (a + b), or ½ when both are zero. */
function share(a: number, b: number): number {
  return a + b === 0 ? 0.5 : a / (a + b);
}

/** Each recorded performance stat as a 0–1 share for `me`. */
export function performanceParts(me: MatchSide, opp: MatchSide): Partial<Record<PerformanceKey, number>> {
  const parts: Partial<Record<PerformanceKey, number>> = { goals: share(me.goals, opp.goals) };
  if (me.shots_on_target !== null && opp.shots_on_target !== null) parts.shots_on_target = share(me.shots_on_target, opp.shots_on_target);
  if (me.shots !== null && opp.shots !== null) parts.shots = share(me.shots, opp.shots);
  if (me.possession_pct !== null && opp.possession_pct !== null) parts.possession = share(me.possession_pct, opp.possession_pct);
  const accuracy = (s: MatchSide) => (s.passes && s.successful_passes !== null ? s.successful_passes / s.passes : null);
  const myAcc = accuracy(me);
  const oppAcc = accuracy(opp);
  if (myAcc !== null && oppAcc !== null) parts.pass_accuracy = share(myAcc, oppAcc);
  return parts;
}

/** Weighted average of the recorded performance shares (0–1). */
export function performanceShare(me: MatchSide, opp: MatchSide): number {
  const parts = performanceParts(me, opp);
  let total = 0;
  let weight = 0;
  for (const [key, value] of Object.entries(parts) as Array<[PerformanceKey, number]>) {
    total += value * PERFORMANCE_WEIGHTS[key];
    weight += PERFORMANCE_WEIGHTS[key];
  }
  return weight === 0 ? 0.5 : total / weight;
}

export function matchScore(outcome: Outcome, performance: number, shootout = false): number {
  const win = shootout ? ELO.shootoutWin : 1;
  const result = outcome === "W" ? win : outcome === "D" ? 0.5 : 1 - win;
  return ELO.resultWeight * result + (1 - ELO.resultWeight) * performance;
}

export interface EloPlayer {
  rating: number;
  games: number;
  provisional: boolean;
  /** Change from this player's most recent match (0 before any). */
  lastDelta: number;
}

export interface EloMatchChange {
  /** Ratings before the match, by player id. */
  before: Record<string, number>;
  delta: Record<string, number>;
  expected: Record<string, number>;
  performance: Record<string, number>;
  score: Record<string, number>;
}

export interface EloTimelinePoint {
  matchNo: number;
  ratings: Record<string, number>;
}

export interface EloResult {
  players: Map<string, EloPlayer>;
  byMatch: Map<string, EloMatchChange>;
  timeline: EloTimelinePoint[];
}

/** One match's rating change for the two players, given their ratings before it. */
export function rateMatch(match: Match, before: Record<string, number>): EloMatchChange {
  const [x, y] = match.sides;
  const w = sideWinner(x, y);
  const outcome: Outcome = w === null ? "D" : w === "x" ? "W" : "L";
  const shootout = hasShootout(x, y);
  const perfX = performanceShare(x, y);
  const expX = expectedScore(before[x.player_id], before[y.player_id]);
  const scoreX = matchScore(outcome, perfX, shootout);
  let deltaX = ELO.k * (scoreX - expX);
  if (outcome === "W") deltaX = Math.max(deltaX, ELO.minWinnerGain);
  if (outcome === "L") deltaX = Math.min(deltaX, -ELO.minWinnerGain);
  return {
    before: { [x.player_id]: before[x.player_id], [y.player_id]: before[y.player_id] },
    delta: { [x.player_id]: deltaX, [y.player_id]: -deltaX },
    expected: { [x.player_id]: expX, [y.player_id]: 1 - expX },
    performance: { [x.player_id]: perfX, [y.player_id]: 1 - perfX },
    score: { [x.player_id]: scoreX, [y.player_id]: 1 - scoreX },
  };
}

/** Replays confirmed matches in match order; everyone starts at ELO.start. */
export function computeElo(matches: readonly Match[], playerIds: readonly string[]): EloResult {
  const rating: Record<string, number> = {};
  const games: Record<string, number> = {};
  const last: Record<string, number> = {};
  for (const id of playerIds) {
    rating[id] = ELO.start;
    games[id] = 0;
    last[id] = 0;
  }
  const byMatch = new Map<string, EloMatchChange>();
  const timeline: EloTimelinePoint[] = [];

  for (const m of officialMatches(matches)) {
    const ids = m.sides.map((s) => s.player_id);
    if (!ids.every((id) => id in rating)) continue;
    const change = rateMatch(m, rating);
    for (const id of ids) {
      rating[id] += change.delta[id];
      games[id] += 1;
      last[id] = change.delta[id];
    }
    byMatch.set(m.id, change);
    timeline.push({ matchNo: m.match_no, ratings: { ...rating } });
  }

  const players = new Map<string, EloPlayer>(
    playerIds.map((id) => [id, { rating: rating[id], games: games[id], provisional: games[id] < ELO.provisionalGames, lastDelta: last[id] }]),
  );
  return { players, byMatch, timeline };
}
