import type { SquadPlayerSummary, SquadStatKey } from "./squad";

/**
 * Strengths and weaknesses: each player's per-match average on a metric is
 * compared with the team's average for it, so "worst at passing" means worst
 * among the teammates who played, not against some absolute scale.
 */

export type DerivedMetric = "shot_accuracy" | "pass_completion" | "dribble_success";
export type InsightMetric = SquadStatKey | DerivedMetric;

/** The areas judged, roughly in the order of the in-game graph. All are "higher is better". */
export const INSIGHT_METRICS: readonly InsightMetric[] = [
  "offensive_positioning",
  "shooting",
  "dueling",
  "defensive_positioning",
  "passing",
  "dribbling",
  "goals",
  "assists",
  "key_passes",
  "shot_accuracy",
  "pass_completion",
  "dribble_success",
  "forward_runs",
  "intercepts",
  "tackles",
  "impactful_steals",
  "good_positioning_pct",
];

export const PERCENT_INSIGHTS: ReadonlySet<InsightMetric> = new Set(["shot_accuracy", "pass_completion", "dribble_success", "good_positioning_pct"]);

/** A difference smaller than this share of the team average isn't called a strength or a weakness. */
const MIN_LIFT = 0.08;
/**
 * The game's own evaluation points and the success rates say the most about how
 * someone plays; raw counts (goals, tackles…) are small numbers that swing a lot
 * from one match to the next, so they weigh less, and a count the team averages
 * under once per match is too thin to call anyone strong or weak at.
 */
const STRONG_SIGNAL: ReadonlySet<InsightMetric> = new Set([
  "offensive_positioning",
  "shooting",
  "dueling",
  "defensive_positioning",
  "passing",
  "dribbling",
  "shot_accuracy",
  "pass_completion",
  "dribble_success",
  "good_positioning_pct",
]);
const COUNT_WEIGHT = 0.5;
const MIN_COUNT_AVG = 1;

/** How much a standing says, for ranking strengths and weaknesses (lift capped at ±100 %). */
export function signal(s: Standing): number {
  const lift = Math.max(-1, Math.min(1, s.lift));
  return STRONG_SIGNAL.has(s.metric) ? lift : lift * COUNT_WEIGHT;
}

function meaningful(s: Standing): boolean {
  return STRONG_SIGNAL.has(s.metric) || s.teamAvg >= MIN_COUNT_AVG;
}

export function metricValue(s: SquadPlayerSummary, m: InsightMetric): number | null {
  if (m === "shot_accuracy") return s.shotAccuracy;
  if (m === "pass_completion") return s.passCompletion;
  if (m === "dribble_success") return s.dribbleSuccess;
  return s.stats[m].average;
}

export interface Standing {
  metric: InsightMetric;
  value: number;
  teamAvg: number;
  /** 1 = best of the players with a value. */
  rank: number;
  of: number;
  best: boolean;
  worst: boolean;
  /** (value − team average) ÷ team average: +0.3 = 30 % above the team. */
  lift: number;
}

/** Every player's standing on every metric two or more players have a value for. */
export function standings(summaries: readonly SquadPlayerSummary[]): Map<string, Standing[]> {
  const out = new Map<string, Standing[]>(summaries.map((s) => [s.playerId, []]));
  const active = summaries.filter((s) => s.games > 0);
  for (const metric of INSIGHT_METRICS) {
    const values = active.map((s) => ({ id: s.playerId, v: metricValue(s, metric) })).filter((x): x is { id: string; v: number } => x.v !== null);
    if (values.length < 2) continue;
    const teamAvg = values.reduce((n, x) => n + x.v, 0) / values.length;
    const max = Math.max(...values.map((x) => x.v));
    const min = Math.min(...values.map((x) => x.v));
    for (const { id, v } of values) {
      out.get(id)!.push({
        metric,
        value: v,
        teamAvg,
        rank: 1 + values.filter((x) => x.v > v).length,
        of: values.length,
        best: max !== min && v === max,
        worst: max !== min && v === min,
        lift: teamAvg > 0 ? (v - teamAvg) / teamAvg : 0,
      });
    }
  }
  return out;
}

export interface PlayerInsight {
  strengths: Standing[];
  weaknesses: Standing[];
}

/** The clearest strengths (furthest above the team) and weaknesses (furthest below), by weighted signal. */
export function strengthsAndWeaknesses(list: readonly Standing[], n = 3): PlayerInsight {
  const strengths = list
    .filter((s) => meaningful(s) && (s.lift >= MIN_LIFT || (s.best && s.lift > 0)))
    .sort((a, b) => signal(b) - signal(a))
    .slice(0, n);
  const weaknesses = list
    .filter((s) => meaningful(s) && (s.lift <= -MIN_LIFT || (s.worst && s.lift < 0)))
    .sort((a, b) => signal(a) - signal(b))
    .slice(0, n);
  return { strengths, weaknesses };
}
