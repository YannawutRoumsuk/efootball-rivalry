export type ScreenSide = "left" | "right";
export type MatchStatus = "confirmed" | "disputed" | "void";

/** Numeric stats shown on the eFootball full-time screen, per side. */
export const STAT_KEYS = [
  "possession_pct",
  "shots",
  "shots_on_target",
  "fouls",
  "offsides",
  "corners",
  "free_kicks",
  "passes",
  "successful_passes",
  "crosses",
  "interceptions",
  "tackles",
  "saves",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey | "goals", string> = {
  goals: "Goals",
  possession_pct: "Possession %",
  shots: "Shots",
  shots_on_target: "Shots on target",
  fouls: "Fouls",
  offsides: "Offsides",
  corners: "Corner kicks",
  free_kicks: "Free kicks",
  passes: "Passes",
  successful_passes: "Successful passes",
  crosses: "Crosses",
  interceptions: "Interceptions",
  tackles: "Tackles",
  saves: "Saves",
};

export type SideStats = { goals: number } & { [K in StatKey]: number | null };

export interface MatchSide extends SideStats {
  player_id: string;
  screen_side: ScreenSide;
  onscreen_label: string | null;
  team_name: string | null;
  /** Penalty shoot-out goals ("6 PK 7"); null/absent when there was no shoot-out. */
  penalties?: number | null;
}

export interface Match {
  id: string;
  match_no: number;
  played_at: string | null;
  status: MatchStatus;
  status_note: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  sides: [MatchSide, MatchSide];
}

export interface Player {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

/** Player A is the room creator; Player B is the invited friend. */
export interface PlayerPair {
  a: Player;
  b: Player;
}

export type PlayerKey = "a" | "b";
export type Outcome = "W" | "D" | "L";
