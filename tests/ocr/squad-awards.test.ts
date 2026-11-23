import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mergeScreenReads, type SquadStats } from "@/lib/domain/squad";
import { readSquadScreen, type SquadOcrResult } from "@/lib/ocr/squad";
import { MATCH2_EXPECTED as EXPECTED } from "./expected";

const shot = (name: string) => readFileSync(join(__dirname, "..", "fixtures", "squad2", `${name}.webp`));

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
