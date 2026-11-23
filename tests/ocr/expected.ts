import type { SquadStats } from "@/lib/domain/squad";

// Ground truth read by eye from the six real screenshots of one 3v3 match (BVB).
export const BVB_EXPECTED: [SquadStats, SquadStats, SquadStats] = [
  {
    total_points: 4615, offensive_positioning: 960, shooting: 370, dueling: 2177, defensive_positioning: 130, passing: 303, dribbling: 675,
    goals: 0, shots: 1, shots_on_target: 1, assists: 1, key_passes: 1, passes: 29, successful_passes: 16,
    instrumental_passes: 10, dribbles: 23, successful_dribbles: 20, instrumental_dribbles: 9, receiving: 43, good_receives: 17, overlaps: 8,
    runs_out_wide: 10, forward_runs: 25, offensive_receives: 1, intercepts: 17, tackles: 1, impactful_steals: 1,
    frontal_presses: 37, presses_from_behind: 17, good_positioning_pct: 61, double_marks: 13, passes_obstructed: 42, players_marked: 35,
  },
  {
    total_points: 4288, offensive_positioning: 591, shooting: 661, dueling: 1921, defensive_positioning: 375, passing: 265, dribbling: 475,
    goals: 1, shots: 2, shots_on_target: 1, assists: 0, key_passes: 0, passes: 10, successful_passes: 8,
    instrumental_passes: 11, dribbles: 15, successful_dribbles: 8, instrumental_dribbles: 10, receiving: 41, good_receives: 15, overlaps: 5,
    runs_out_wide: 3, forward_runs: 17, offensive_receives: 1, intercepts: 14, tackles: 3, impactful_steals: 2,
    frontal_presses: 62, presses_from_behind: 45, good_positioning_pct: 58, double_marks: 37, passes_obstructed: 42, players_marked: 34,
  },
  {
    total_points: 2910, offensive_positioning: 539, shooting: 308, dueling: 1327, defensive_positioning: 306, passing: 187, dribbling: 243,
    goals: 2, shots: 2, shots_on_target: 2, assists: 0, key_passes: 0, passes: 14, successful_passes: 12,
    instrumental_passes: 8, dribbles: 15, successful_dribbles: 9, instrumental_dribbles: 5, receiving: 41, good_receives: 14, overlaps: 6,
    runs_out_wide: 5, forward_runs: 7, offensive_receives: 1, intercepts: 4, tackles: 3, impactful_steals: 3,
    frontal_presses: 47, presses_from_behind: 38, good_positioning_pct: 59, double_marks: 20, passes_obstructed: 45, players_marked: 45,
  },
];

// Second real match (2532×1170 iPhone screenshots), read by eye. Column order: WyNM, bigverx, Do3minicT0rett0.
export const MATCH2_EXPECTED: [SquadStats, SquadStats, SquadStats] = [
  {
    total_points: 933, offensive_positioning: 132, shooting: 0, dueling: 408, defensive_positioning: 291, passing: 125, dribbling: -23,
    goals: 0, shots: 0, shots_on_target: 0, assists: 0, key_passes: 1, passes: 23, successful_passes: 19,
    instrumental_passes: 3, dribbles: 21, successful_dribbles: 17, instrumental_dribbles: 0, receiving: 4, good_receives: 1, overlaps: 2,
    runs_out_wide: 1, forward_runs: 5, offensive_receives: 0, intercepts: 4, tackles: 4, impactful_steals: 3,
    frontal_presses: 8, presses_from_behind: 5, good_positioning_pct: 64, double_marks: 8, passes_obstructed: 12, players_marked: 3,
  },
  {
    total_points: 966, offensive_positioning: 193, shooting: 0, dueling: 318, defensive_positioning: 287, passing: 87, dribbling: 81,
    goals: 0, shots: 0, shots_on_target: 0, assists: 1, key_passes: 1, passes: 20, successful_passes: 14,
    instrumental_passes: 2, dribbles: 13, successful_dribbles: 12, instrumental_dribbles: 1, receiving: 9, good_receives: 3, overlaps: 1,
    runs_out_wide: 3, forward_runs: 4, offensive_receives: 1, intercepts: 2, tackles: 3, impactful_steals: 3,
    frontal_presses: 9, presses_from_behind: 8, good_positioning_pct: 60, double_marks: 6, passes_obstructed: 8, players_marked: 6,
  },
  {
    total_points: 819, offensive_positioning: 153, shooting: 138, dueling: 287, defensive_positioning: 260, passing: 28, dribbling: -47,
    goals: 1, shots: 3, shots_on_target: 2, assists: 0, key_passes: 0, passes: 12, successful_passes: 11,
    instrumental_passes: 1, dribbles: 19, successful_dribbles: 11, instrumental_dribbles: 0, receiving: 8, good_receives: 2, overlaps: 0,
    runs_out_wide: 1, forward_runs: 2, offensive_receives: 0, intercepts: 1, tackles: 3, impactful_steals: 2,
    frontal_presses: 7, presses_from_behind: 5, good_positioning_pct: 64, double_marks: 9, passes_obstructed: 14, players_marked: 1,
  },
];
