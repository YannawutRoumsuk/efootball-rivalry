import type { PlayerBoardRow } from "./player-stats";
import type { SquadPlayerSummary } from "./squad";

/** Metrics both modes record, per player: 1v1 (whole team, vs each other) next to 3v3 (own share). */
export const COMPARE_METRICS = ["goals", "shots", "accuracy", "passes", "passCompletion", "tackles", "interceptions"] as const;
export type CompareMetric = (typeof COMPARE_METRICS)[number];

export const PERCENT_METRICS: ReadonlySet<CompareMetric> = new Set(["accuracy", "passCompletion"]);

export interface ModeLine {
  games: number;
  values: Record<CompareMetric, number | null>;
}

export interface ModeComparison {
  playerId: string;
  v1: ModeLine;
  v3: ModeLine;
}

export function oneVsOneLine(row: PlayerBoardRow | undefined): ModeLine {
  return {
    games: row?.games ?? 0,
    values: {
      goals: row?.goalsFor.average ?? null,
      shots: row?.stats.shots.average ?? null,
      accuracy: row?.shotAccuracy ?? null,
      passes: row?.stats.passes.average ?? null,
      passCompletion: row?.passCompletion ?? null,
      tackles: row?.stats.tackles.average ?? null,
      interceptions: row?.stats.interceptions.average ?? null,
    },
  };
}

export function squadLine(s: SquadPlayerSummary | undefined): ModeLine {
  return {
    games: s?.games ?? 0,
    values: {
      goals: s?.stats.goals.average ?? null,
      shots: s?.stats.shots.average ?? null,
      accuracy: s?.shotAccuracy ?? null,
      passes: s?.stats.passes.average ?? null,
      passCompletion: s?.passCompletion ?? null,
      tackles: s?.stats.tackles.average ?? null,
      interceptions: s?.stats.intercepts.average ?? null,
    },
  };
}

export function compareModes(
  playerIds: readonly string[],
  board: readonly PlayerBoardRow[],
  squad: readonly SquadPlayerSummary[],
): ModeComparison[] {
  return playerIds.map((id) => ({
    playerId: id,
    v1: oneVsOneLine(board.find((r) => r.player.id === id)),
    v3: squadLine(squad.find((s) => s.playerId === id)),
  }));
}
