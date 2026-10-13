import type { PerspectiveMatch } from "./match";
import { computeStreaks, summarizeRivalry } from "./stats";
import type { PlayerKey, PlayerPair } from "./types";

export type RecordKind =
  | "biggest_win"
  | "longest_streak"
  | "highest_scoring_match"
  | "most_goals_single_player";

export interface NewRecord {
  kind: RecordKind;
  title: string;
  detail: string;
}

function maxGoalsByOnePlayer(matches: readonly PerspectiveMatch[]): number {
  return matches.reduce((max, pm) => Math.max(max, pm.a.goals, pm.b.goals), 0);
}

function maxTotalGoals(matches: readonly PerspectiveMatch[]): number {
  return matches.reduce((max, pm) => Math.max(max, pm.a.goals + pm.b.goals), 0);
}

/**
 * Compares rivalry records before and after a match was saved and reports
 * the ones the new match broke. Records must be strictly beaten, not tied,
 * and nothing is reported for the very first match.
 */
export function detectNewRecords(
  before: readonly PerspectiveMatch[],
  after: readonly PerspectiveMatch[],
  newMatchId: string,
  pair: PlayerPair,
): NewRecord[] {
  if (before.length === 0) return [];
  const newMatch = after.find((pm) => pm.match.id === newMatchId);
  if (!newMatch || newMatch.match.status !== "confirmed") return [];

  const name = (key: PlayerKey) => pair[key].display_name;
  const records: NewRecord[] = [];

  const prevWin = summarizeRivalry(before).biggestWin?.margin ?? 0;
  const margin = Math.abs(newMatch.a.goals - newMatch.b.goals);
  if (newMatch.winner !== "draw" && margin > prevWin) {
    const w = newMatch.winner;
    const score = w === "a" ? `${newMatch.a.goals}–${newMatch.b.goals}` : `${newMatch.b.goals}–${newMatch.a.goals}`;
    records.push({
      kind: "biggest_win",
      title: "New biggest victory",
      detail: `${name(w)} won ${score} (+${margin})`,
    });
  }

  const prevStreak = computeStreaks(before).longest;
  const nextStreak = computeStreaks(after).longest;
  for (const key of ["a", "b"] as const) {
    if (nextStreak[key] > Math.max(prevStreak.a, prevStreak.b) && nextStreak[key] > prevStreak[key]) {
      records.push({
        kind: "longest_streak",
        title: "New longest winning streak",
        detail: `${name(key)} — ${nextStreak[key]} wins in a row`,
      });
    }
  }

  const total = newMatch.a.goals + newMatch.b.goals;
  if (total > maxTotalGoals(before)) {
    records.push({
      kind: "highest_scoring_match",
      title: "Highest-scoring match ever",
      detail: `${total} goals in match #${newMatch.match.match_no}`,
    });
  }

  const topScorer: PlayerKey = newMatch.a.goals >= newMatch.b.goals ? "a" : "b";
  const topGoals = Math.max(newMatch.a.goals, newMatch.b.goals);
  if (topGoals > maxGoalsByOnePlayer(before)) {
    records.push({
      kind: "most_goals_single_player",
      title: "Most goals by one player",
      detail: `${name(topScorer)} scored ${topGoals}`,
    });
  }

  return records;
}
