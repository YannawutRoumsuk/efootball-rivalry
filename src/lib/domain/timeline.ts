import { percent } from "./math";
import type { PerspectiveMatch } from "./match";
import type { PlayerKey } from "./types";

export interface TimelinePoint {
  matchNo: number;
  matchId: string;
  label: string;
  playedAt: string | null;
  winner: PlayerKey | "draw";
  goalsA: number;
  goalsB: number;
  cumWinsA: number;
  cumWinsB: number;
  cumDraws: number;
  cumGoalDiffA: number;
  cumGoalDiffB: number;
  possessionA: number | null;
  possessionB: number | null;
  shotsA: number | null;
  shotsB: number | null;
  onTargetA: number | null;
  onTargetB: number | null;
  shotAccuracyA: number | null;
  shotAccuracyB: number | null;
  passesA: number | null;
  passesB: number | null;
  successfulPassesA: number | null;
  successfulPassesB: number | null;
  passCompletionA: number | null;
  passCompletionB: number | null;
  /** Win % over the previous 5 / 10 matches; null until the window is full. */
  rolling5A: number | null;
  rolling5B: number | null;
  rolling10A: number | null;
  rolling10B: number | null;
  /** Signed streak after this match: +n = Player A on n wins, −n = Player B. */
  streak: number;
}

function rollingWinRate(
  matches: readonly PerspectiveMatch[],
  index: number,
  window: number,
  key: PlayerKey,
): number | null {
  if (index + 1 < window) return null;
  const slice = matches.slice(index + 1 - window, index + 1);
  return percent(slice.filter((pm) => pm.winner === key).length, window);
}

function ratio(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null) return null;
  return percent(part, whole);
}

/** Builds per-match chart data from confirmed, chronologically-sorted matches. */
export function buildTimeline(matches: readonly PerspectiveMatch[]): TimelinePoint[] {
  let winsA = 0;
  let winsB = 0;
  let draws = 0;
  let gdA = 0;
  let streak = 0;

  return matches.map((pm, index) => {
    const { a, b, winner } = pm;
    if (winner === "a") winsA += 1;
    else if (winner === "b") winsB += 1;
    else draws += 1;
    gdA += a.goals - b.goals;

    if (winner === "draw") streak = 0;
    else if (winner === "a") streak = streak > 0 ? streak + 1 : 1;
    else streak = streak < 0 ? streak - 1 : -1;

    return {
      matchNo: pm.match.match_no,
      matchId: pm.match.id,
      label: `#${pm.match.match_no}`,
      playedAt: pm.match.played_at,
      winner,
      goalsA: a.goals,
      goalsB: b.goals,
      cumWinsA: winsA,
      cumWinsB: winsB,
      cumDraws: draws,
      cumGoalDiffA: gdA,
      cumGoalDiffB: -gdA,
      possessionA: a.possession_pct,
      possessionB: b.possession_pct,
      shotsA: a.shots,
      shotsB: b.shots,
      onTargetA: a.shots_on_target,
      onTargetB: b.shots_on_target,
      shotAccuracyA: ratio(a.shots_on_target, a.shots),
      shotAccuracyB: ratio(b.shots_on_target, b.shots),
      passesA: a.passes,
      passesB: b.passes,
      successfulPassesA: a.successful_passes,
      successfulPassesB: b.successful_passes,
      passCompletionA: ratio(a.successful_passes, a.passes),
      passCompletionB: ratio(b.successful_passes, b.passes),
      rolling5A: rollingWinRate(matches, index, 5, "a"),
      rolling5B: rollingWinRate(matches, index, 5, "b"),
      rolling10A: rollingWinRate(matches, index, 10, "a"),
      rolling10B: rollingWinRate(matches, index, 10, "b"),
      streak,
    };
  });
}

export type StatsRange =
  | { kind: "all" }
  | { kind: "last"; count: number }
  | { kind: "dates"; from: string | null; to: string | null };

export interface RangeResult {
  matches: PerspectiveMatch[];
  /** Matches excluded from a date range because their date is unknown. */
  undatedExcluded: number;
}

/**
 * Applies a range filter to confirmed, chronological matches. Date ranges use
 * the real match date only — matches without a known date are excluded and
 * counted, never placed using upload time.
 */
export function applyRange(matches: readonly PerspectiveMatch[], range: StatsRange): RangeResult {
  if (range.kind === "all") return { matches: [...matches], undatedExcluded: 0 };
  if (range.kind === "last") {
    return { matches: matches.slice(Math.max(0, matches.length - range.count)), undatedExcluded: 0 };
  }

  const from = range.from ? Date.parse(range.from) : null;
  const to = range.to ? Date.parse(`${range.to.slice(0, 10)}T23:59:59.999Z`) : null;
  let undatedExcluded = 0;
  const filtered = matches.filter((pm) => {
    if (!pm.match.played_at) {
      undatedExcluded += 1;
      return false;
    }
    const t = Date.parse(pm.match.played_at);
    return (from === null || t >= from) && (to === null || t <= to);
  });
  return { matches: filtered, undatedExcluded };
}

export function parseRange(params: { range?: string; from?: string; to?: string }): StatsRange {
  const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  switch (params.range) {
    case "last5":
      return { kind: "last", count: 5 };
    case "last10":
      return { kind: "last", count: 10 };
    case "last20":
      return { kind: "last", count: 20 };
    case "dates":
      return { kind: "dates", from: isDate(params.from), to: isDate(params.to) };
    default:
      return { kind: "all" };
  }
}
