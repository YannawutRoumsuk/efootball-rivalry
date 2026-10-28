import { aggregate, pairedPercent, percent, type MetricAggregate } from "./math";
import { opponentOf, outcomeFor, sideFor, type PerspectiveMatch } from "./match";
import type { Outcome, PlayerKey } from "./types";

export interface MatchRef {
  matchId: string;
  matchNo: number;
}

export interface WinRecord extends MatchRef {
  margin: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface PlayerSummary {
  wins: number;
  draws: number;
  losses: number;
  /** Wins / total matches × 100. */
  winRate: number | null;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  avgGoalsFor: number | null;
  avgGoalsAgainst: number | null;
  possession: MetricAggregate;
  shots: MetricAggregate;
  shotsOnTarget: MetricAggregate;
  passes: MetricAggregate;
  successfulPasses: MetricAggregate;
  tackles: MetricAggregate;
  interceptions: MetricAggregate;
  saves: MetricAggregate;
  fouls: MetricAggregate;
  corners: MetricAggregate;
  /** Σ shots on target / Σ shots × 100 (matches reporting both). */
  shotAccuracy: number | null;
  /** Σ goals / Σ shots × 100 (matches reporting shots). */
  conversionRate: number | null;
  /** Σ successful passes / Σ passes × 100 (matches reporting both). */
  passCompletion: number | null;
  cleanSheets: number;
  longestWinStreak: number;
  biggestWin: WinRecord | null;
  mostGoalsInMatch: (MatchRef & { goals: number }) | null;
  bestShotAccuracy: (MatchRef & { accuracy: number; shots: number; onTarget: number }) | null;
}

export interface StreakState {
  holder: PlayerKey | null;
  length: number;
}

export interface RivalrySummary {
  totalMatches: number;
  draws: number;
  a: PlayerSummary;
  b: PlayerSummary;
  currentStreak: StreakState;
  biggestWin: (WinRecord & { winner: PlayerKey }) | null;
  highestScoringMatch: (MatchRef & { totalGoals: number; goalsA: number; goalsB: number }) | null;
}

/** Minimum shots for a single-match accuracy record, so 1/1 doesn't count as 100%. */
export const MIN_SHOTS_FOR_ACCURACY_RECORD = 3;

export function computeStreaks(matches: readonly PerspectiveMatch[]): {
  current: StreakState;
  longest: Record<PlayerKey, number>;
} {
  const longest: Record<PlayerKey, number> = { a: 0, b: 0 };
  let current: StreakState = { holder: null, length: 0 };

  for (const pm of matches) {
    if (pm.winner === "draw") {
      current = { holder: null, length: 0 };
      continue;
    }
    current =
      current.holder === pm.winner
        ? { holder: pm.winner, length: current.length + 1 }
        : { holder: pm.winner, length: 1 };
    longest[pm.winner] = Math.max(longest[pm.winner], current.length);
  }
  return { current, longest };
}

/** Results for one player, oldest → newest, limited to the last `limit` matches. */
export function recentForm(
  matches: readonly PerspectiveMatch[],
  key: PlayerKey,
  limit: number,
): Outcome[] {
  return matches.slice(Math.max(0, matches.length - limit)).map((pm) => outcomeFor(pm, key));
}

function bestBy<T>(items: readonly T[], score: (item: T) => number | null): T | null {
  let best: T | null = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const s = score(item);
    // Strictly greater: the earliest match keeps a tied record.
    if (s !== null && s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

function ref(pm: PerspectiveMatch): MatchRef {
  return { matchId: pm.match.id, matchNo: pm.match.match_no };
}

function playerRecords(matches: readonly PerspectiveMatch[], key: PlayerKey) {
  const opp = opponentOf(key);
  const wins = matches.filter((pm) => pm.winner === key);
  // A shoot-out win has no goal margin, so it never counts as a "biggest win".
  const marginWins = wins.filter((pm) => sideFor(pm, key).goals > sideFor(pm, opp).goals);

  const bigWin = bestBy(marginWins, (pm) => sideFor(pm, key).goals - sideFor(pm, opp).goals);
  const mostGoals = bestBy(matches, (pm) => sideFor(pm, key).goals);
  const bestAcc = bestBy(matches, (pm) => {
    const s = sideFor(pm, key);
    if (s.shots === null || s.shots_on_target === null) return null;
    if (s.shots < MIN_SHOTS_FOR_ACCURACY_RECORD) return null;
    return s.shots_on_target / s.shots;
  });

  return {
    biggestWin: bigWin
      ? {
          ...ref(bigWin),
          goalsFor: sideFor(bigWin, key).goals,
          goalsAgainst: sideFor(bigWin, opp).goals,
          margin: sideFor(bigWin, key).goals - sideFor(bigWin, opp).goals,
        }
      : null,
    mostGoalsInMatch: mostGoals ? { ...ref(mostGoals), goals: sideFor(mostGoals, key).goals } : null,
    bestShotAccuracy: bestAcc
      ? {
          ...ref(bestAcc),
          shots: sideFor(bestAcc, key).shots ?? 0,
          onTarget: sideFor(bestAcc, key).shots_on_target ?? 0,
          accuracy: percent(
            sideFor(bestAcc, key).shots_on_target ?? 0,
            sideFor(bestAcc, key).shots ?? 0,
          ) ?? 0,
        }
      : null,
  };
}

export function summarizePlayer(
  matches: readonly PerspectiveMatch[],
  key: PlayerKey,
  longestWinStreak: number,
): PlayerSummary {
  const opp = opponentOf(key);
  const mine = matches.map((pm) => sideFor(pm, key));
  const theirs = matches.map((pm) => sideFor(pm, opp));
  const total = matches.length;

  const wins = matches.filter((pm) => pm.winner === key).length;
  const draws = matches.filter((pm) => pm.winner === "draw").length;
  const goalsFor = mine.reduce((sum, s) => sum + s.goals, 0);
  const goalsAgainst = theirs.reduce((sum, s) => sum + s.goals, 0);
  const shots = aggregate(mine.map((s) => s.shots));
  const goalsWithShots = mine.filter((s) => s.shots !== null).reduce((sum, s) => sum + s.goals, 0);

  return {
    wins,
    draws,
    losses: total - wins - draws,
    winRate: percent(wins, total),
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    avgGoalsFor: total > 0 ? goalsFor / total : null,
    avgGoalsAgainst: total > 0 ? goalsAgainst / total : null,
    possession: aggregate(mine.map((s) => s.possession_pct)),
    shots,
    shotsOnTarget: aggregate(mine.map((s) => s.shots_on_target)),
    passes: aggregate(mine.map((s) => s.passes)),
    successfulPasses: aggregate(mine.map((s) => s.successful_passes)),
    tackles: aggregate(mine.map((s) => s.tackles)),
    interceptions: aggregate(mine.map((s) => s.interceptions)),
    saves: aggregate(mine.map((s) => s.saves)),
    fouls: aggregate(mine.map((s) => s.fouls)),
    corners: aggregate(mine.map((s) => s.corners)),
    shotAccuracy: pairedPercent(mine.map((s) => ({ part: s.shots_on_target, whole: s.shots }))),
    conversionRate: percent(goalsWithShots, shots.total),
    passCompletion: pairedPercent(mine.map((s) => ({ part: s.successful_passes, whole: s.passes }))),
    cleanSheets: theirs.filter((s) => s.goals === 0).length,
    longestWinStreak,
    ...playerRecords(matches, key),
  };
}

/** Full head-to-head summary. `matches` must be confirmed and chronological. */
export function summarizeRivalry(matches: readonly PerspectiveMatch[]): RivalrySummary {
  const { current, longest } = computeStreaks(matches);
  const a = summarizePlayer(matches, "a", longest.a);
  const b = summarizePlayer(matches, "b", longest.b);

  const biggestWin = [
    a.biggestWin && { ...a.biggestWin, winner: "a" as const },
    b.biggestWin && { ...b.biggestWin, winner: "b" as const },
  ]
    .filter((w): w is WinRecord & { winner: PlayerKey } => w !== null)
    .sort((x, y) => y.margin - x.margin || x.matchNo - y.matchNo)[0] ?? null;

  const highest = bestBy(matches, (pm) => pm.a.goals + pm.b.goals);

  return {
    totalMatches: matches.length,
    draws: matches.filter((pm) => pm.winner === "draw").length,
    a,
    b,
    currentStreak: current,
    biggestWin,
    highestScoringMatch: highest
      ? {
          ...ref(highest),
          totalGoals: highest.a.goals + highest.b.goals,
          goalsA: highest.a.goals,
          goalsB: highest.b.goals,
        }
      : null,
  };
}
