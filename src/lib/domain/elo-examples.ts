import { ELO, rateMatch, type EloMatchChange } from "./elo";
import type { Match, MatchSide } from "./types";

/** Worked examples for the Elo guide, computed with the real formula so the page can never drift from the code. */
export interface EloExample {
  id: "even" | "favourite" | "upset" | "closeLoss" | "thrashing";
  ratings: [number, number];
  score: [number, number];
  /** Stats that went into the performance share (shots on target, possession %). */
  stats: { sot: [number, number]; possession: [number, number] };
  change: EloMatchChange;
}

function side(player_id: string, goals: number, sot: number, possession: number): MatchSide {
  return {
    player_id,
    screen_side: player_id === "A" ? "left" : "right",
    onscreen_label: null,
    team_name: null,
    goals,
    possession_pct: possession,
    shots: null,
    shots_on_target: sot,
    fouls: null,
    offsides: null,
    corners: null,
    free_kicks: null,
    passes: null,
    successful_passes: null,
    crosses: null,
    interceptions: null,
    tackles: null,
    saves: null,
  };
}

function example(id: EloExample["id"], ratings: [number, number], score: [number, number], sot: [number, number], possession: [number, number]): EloExample {
  const match: Match = {
    id,
    match_no: 1,
    played_at: null,
    status: "confirmed",
    status_note: null,
    created_by: "A",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    sides: [side("A", score[0], sot[0], possession[0]), side("B", score[1], sot[1], possession[1])],
  };
  return { id, ratings, score, stats: { sot, possession }, change: rateMatch(match, { A: ratings[0], B: ratings[1] }) };
}

export const ELO_EXAMPLES: EloExample[] = [
  example("even", [ELO.start, ELO.start], [2, 1], [5, 4], [52, 48]),
  example("favourite", [1100, 900], [3, 0], [7, 1], [62, 38]),
  example("upset", [900, 1100], [1, 0], [3, 4], [45, 55]),
  example("closeLoss", [900, 1100], [2, 3], [6, 5], [55, 45]),
  example("thrashing", [900, 1100], [0, 5], [1, 8], [35, 65]),
];
