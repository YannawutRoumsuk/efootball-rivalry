import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { mergeScreenReads, type SquadStats } from "@/lib/domain/squad";
import { readSquadScreen, type SquadOcrResult } from "@/lib/ocr/squad";
import { readFullTimeScreen } from "@/lib/ocr/fulltime";

const shot = (n: number) => readFileSync(join(__dirname, "..", "fixtures", "squad", `bvb-${n}.webp`));

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

/** Every value OCR did read must be right; returns how many were left blank. */
function checkRead(read: SquadOcrResult): number {
  let blanks = 0;
  for (const [key, cells] of Object.entries(read.values)) {
    cells!.forEach((v, i) => {
      if (v === null) blanks += 1;
      else expect({ key, col: i, v }).toEqual({ key, col: i, v: BVB_EXPECTED[i][key as keyof SquadStats] });
    });
  }
  return blanks;
}

describe("local OCR of the 3v3 squad table", () => {
  it("reads names, team and rows from all six screenshots and never invents a value", async () => {
    const reads: SquadOcrResult[] = [];
    let blanks = 0;
    for (let n = 1; n <= 6; n += 1) {
      const read = await readSquadScreen(shot(n));
      reads.push(read);
      blanks += checkRead(read);
    }
    expect(reads.map((r) => r.rows.length)).toEqual([3, 6, 5, 6, 6, 6]);
    expect(reads[0].rows).toEqual(["Total Points", "Offensive Positioning", "Shooting"]);
    const draft = mergeScreenReads(reads, []);
    expect(draft.missingRows).toEqual([]);
    expect(draft.conflicts).toEqual([]);
    expect(draft.columns.map((c) => c.ingameName?.toLowerCase().replace(/o/g, "0"))).toEqual(["wynm", "d03minict0rett0", "bigverx"]);
    expect(draft.team).toBe("BVB");
    // 99 cells in total; a handful of lone thin digits may stay blank for the user to fill in.
    expect(blanks).toBeLessThanOrEqual(6);
  }, 240_000);

  it("rejects a 1v1 Full Time screenshot as not a squad table", async () => {
    const fulltime = readFileSync(join(__dirname, "..", "fixtures", "fulltime-kyngian-5-2.webp"));
    const read = await readSquadScreen(fulltime);
    expect(read.problems).toContain("no squad stats table found");
    expect(read.values).toEqual({});
  }, 60_000);

  it("leaves the 1v1 reader working after a squad read (worker parameters restored)", async () => {
    await readSquadScreen(shot(2));
    const fulltime = readFileSync(join(__dirname, "..", "fixtures", "fulltime-kyngian-5-2.webp"));
    const read = await readFullTimeScreen(fulltime);
    expect(read.complete).toBe(true);
  }, 120_000);

  it("works on an iPhone-sized screenshot of the same screen", async () => {
    const scaled = await sharp(shot(6)).resize({ width: 2556, height: 1181, fit: "fill" }).png().toBuffer();
    const read = await readSquadScreen(scaled);
    expect(read.rows.length).toBe(6);
    expect(checkRead(read)).toBeLessThanOrEqual(2);
  }, 120_000);
});
