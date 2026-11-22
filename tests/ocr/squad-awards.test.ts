import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeScreenReads, type SquadStats } from "@/lib/domain/squad";
import { readSquadScreen, type SquadOcrResult } from "@/lib/ocr/squad";

const shot = (name: string) => readFileSync(join(__dirname, "..", "fixtures", "squad2", `${name}.webp`));

// Second real match (2532×1170 iPhone screenshots), read by eye. Column order: WyNM, bigverx, Do3minicT0rett0.
const EXPECTED: [SquadStats, SquadStats, SquadStats] = [
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

describe("local OCR of a second 3v3 match (negative points, Co-op Awards)", () => {
  it("reads every table screenshot, including negative evaluation points, and never a wrong value", async () => {
    const reads: SquadOcrResult[] = [];
    let blanks = 0;
    for (let n = 1; n <= 6; n += 1) {
      const read = await readSquadScreen(shot(`table-${n}`));
      reads.push(read);
      for (const [key, cells] of Object.entries(read.values)) {
        cells!.forEach((v, i) => {
          if (v === null) blanks += 1;
          // Total Points is replaced by the category sum on merge; the stylised digits may misread.
          else if (key !== "total_points") expect({ key, i, v }).toEqual({ key, i, v: EXPECTED[i][key as keyof SquadStats] });
        });
      }
    }
    expect(reads[1].values.dribbling).toEqual([-23, 81, -47]);
    const draft = mergeScreenReads(reads, []);
    expect(draft.columns.map((c) => c.stats.total_points)).toEqual([933, 966, 819]);
    expect(draft.missingRows).toEqual([]);
    expect(blanks).toBeLessThanOrEqual(4);
  }, 300_000);

  it("reads the Co-op Awards screen: titles and their tiers, matched to the right columns", async () => {
    const awards = await readSquadScreen(shot("awards"));
    expect(awards.rows).toEqual([]);
    expect(awards.awards).toEqual([
      [{ title: "The Architect", tier: "gold" }, { title: "Maestro", tier: "silver" }, { title: "Through Passer", tier: "silver" }],
      [{ title: "Pass Receiver", tier: "bronze" }, { title: "Reliable", tier: "bronze" }, { title: "Sprinter", tier: "bronze" }],
      [{ title: "First Blood", tier: "silver" }, { title: "Goal Hunter", tier: "silver" }, { title: "Pass Receiver", tier: "bronze" }],
    ]);
    const table = await readSquadScreen(shot("table-3"));
    const draft = mergeScreenReads([table, awards], []);
    expect(draft.columns.map((c) => c.awards[0]?.title)).toEqual(["The Architect", "Pass Receiver", "First Blood"]);
  }, 120_000);

  it("does not mistake the score screen for awards or a table", async () => {
    const read = await readSquadScreen(shot("fulltime"));
    expect(read.awards ?? null).toBeNull();
    expect(read.problems).toContain("no squad stats table found");
  }, 60_000);
});
