import { aggregate, pairedPercent, percent, type MetricAggregate } from "./math";
import { officialMatches, winnerPlayerId } from "./match";
import type { RosterPlayer } from "./league";
import type { Match, MatchSide, StatKey } from "./types";

/** In-game stats on the all-players board, in screen order. */
export const BOARD_STATS = [
  "possession_pct",
  "shots",
  "shots_on_target",
  "corners",
  "free_kicks",
  "passes",
  "successful_passes",
  "crosses",
  "interceptions",
  "tackles",
  "saves",
  "fouls",
  "offsides",
] as const satisfies readonly StatKey[];

export type BoardStat = (typeof BOARD_STATS)[number];

/** Stats where a lower average is the better one (used to highlight the leader). */
export const LOWER_IS_BETTER: ReadonlySet<BoardStat | "goalsAgainst"> = new Set(["fouls", "offsides", "goalsAgainst"]);

export interface PlayerBoardRow {
  player: RosterPlayer;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number | null;
  goalsFor: MetricAggregate;
  goalsAgainst: MetricAggregate;
  stats: Record<BoardStat, MetricAggregate>;
  /** Σ on target ÷ Σ shots × 100, over matches that recorded both. */
  shotAccuracy: number | null;
  /** Σ goals ÷ Σ shots × 100, over matches that recorded shots. */
  conversion: number | null;
  /** Σ successful ÷ Σ passes × 100, over matches that recorded both. */
  passCompletion: number | null;
  cleanSheets: number;
}

/**
 * Per-player averages across every opponent, so players who played a
 * different number of games can be compared fairly. Confirmed matches only;
 * a missing stat is skipped, never counted as zero.
 */
export function playerBoard(matches: readonly Match[], roster: readonly RosterPlayer[]): PlayerBoardRow[] {
  const official = officialMatches(matches);
  return roster.map((player) => {
    const mine: Array<{ me: MatchSide; opp: MatchSide; winner: string | null }> = [];
    for (const m of official) {
      const me = m.sides.find((s) => s.player_id === player.id);
      const opp = m.sides.find((s) => s.player_id !== player.id);
      if (me && opp) mine.push({ me, opp, winner: winnerPlayerId(m) });
    }
    const wins = mine.filter((x) => x.winner === player.id).length;
    const draws = mine.filter((x) => x.winner === null).length;
    const stats = Object.fromEntries(BOARD_STATS.map((k) => [k, aggregate(mine.map((x) => x.me[k]))])) as Record<BoardStat, MetricAggregate>;
    const shotsReported = mine.filter((x) => x.me.shots !== null);
    return {
      player,
      games: mine.length,
      wins,
      draws,
      losses: mine.length - wins - draws,
      winRate: percent(wins, mine.length),
      goalsFor: aggregate(mine.map((x) => x.me.goals)),
      goalsAgainst: aggregate(mine.map((x) => x.opp.goals)),
      stats,
      shotAccuracy: pairedPercent(mine.map((x) => ({ part: x.me.shots_on_target, whole: x.me.shots }))),
      conversion: percent(
        shotsReported.reduce((n, x) => n + x.me.goals, 0),
        shotsReported.reduce((n, x) => n + (x.me.shots ?? 0), 0),
      ),
      passCompletion: pairedPercent(mine.map((x) => ({ part: x.me.successful_passes, whole: x.me.passes }))),
      cleanSheets: mine.filter((x) => x.opp.goals === 0).length,
    };
  });
}

/**
 * Index(es) of the best value in a row; empty when fewer than two players have
 * a value or all are equal. Values are compared at the precision shown on
 * screen (`digits`), so two cells that read the same are treated as a tie.
 */
export function leaders(values: ReadonlyArray<number | null>, lowerIsBetter = false, digits = 1): number[] {
  const f = 10 ** digits;
  const present = values
    .map((v, i) => ({ v: v === null ? null : Math.round(v * f) / f, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null);
  if (present.length < 2) return [];
  const best = lowerIsBetter ? Math.min(...present.map((x) => x.v)) : Math.max(...present.map((x) => x.v));
  if (present.every((x) => x.v === best)) return [];
  return present.filter((x) => x.v === best).map((x) => x.i);
}
