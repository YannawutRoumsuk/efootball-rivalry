import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { mergeScreenReads, type SquadStats } from "@/lib/domain/squad";
import { readSquadScreen, type SquadOcrResult } from "@/lib/ocr/squad";
import { readFullTimeScreen } from "@/lib/ocr/fulltime";
import { BVB_EXPECTED } from "./expected";

const shot = (n: number) => readFileSync(join(__dirname, "..", "fixtures", "squad", `bvb-${n}.webp`));

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
