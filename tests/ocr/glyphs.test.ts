import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { SquadRow, SquadStats } from "@/lib/domain/squad";
import { decode } from "@/lib/ocr/fulltime";
import { classify, decodeTemplates, encodeTemplates, FEATURES, readGlyphs, segmentCell, trusted, TRUST, type Segment, type Template, type TemplateFile } from "@/lib/ocr/glyphs";
import { cellRegion, locateRows } from "@/lib/ocr/squad";
import { BVB_EXPECTED, MATCH2_EXPECTED } from "./expected";

/**
 * Trains and checks the glyph templates on the two real matches.
 * Retrain after adding screenshots: TRAIN_GLYPHS=1 npx vitest run tests/ocr/glyphs.test.ts
 */

const FIXTURES = join(__dirname, "..", "fixtures");
const TEMPLATE_PATH = join(__dirname, "..", "..", "src", "lib", "ocr", "glyph-templates.json");
const SETS = [
  { name: "BVB (2000×924)", files: [1, 2, 3, 4, 5, 6].map((n) => join(FIXTURES, "squad", `bvb-${n}.webp`)), expected: BVB_EXPECTED },
  { name: "match 2 (2532×1170)", files: [1, 2, 3, 4, 5, 6].map((n) => join(FIXTURES, "squad2", `table-${n}.webp`)), expected: MATCH2_EXPECTED },
];

interface Cell {
  set: number;
  label: string;
  want: string;
  segments: Segment[];
}

function expectedText(row: SquadRow, s: SquadStats): string {
  const v = (k: number) => s[row.keys[k]!];
  if (row.format === "pair") return `${v(0)}(${v(1)})`;
  if (row.format === "pct") return `${v(0)}%`;
  return String(v(0));
}

/** Glyph samples of cells whose glyph count matches the expected text (the minus sign is found by shape). */
function samplesOf(cells: readonly Cell[]): Template[] {
  const out: Template[] = [];
  for (const c of cells) {
    const chars = [...c.want];
    if (c.segments.length !== chars.length) continue;
    c.segments.forEach((s, i) => {
      if (!s.char) out.push({ char: chars[i], features: s.features });
    });
  }
  return out;
}

/** Drops samples nearly identical to one already kept, so the shipped file stays small. */
function prune(samples: readonly Template[], within = 4): Template[] {
  const kept: Template[] = [];
  for (const s of samples) {
    const twin = kept.some((k) => {
      if (k.char !== s.char) return false;
      let d = 0;
      for (let i = 0; i < FEATURES && d < within; i += 1) d += Math.abs(k.features[i] - s.features[i]);
      return d < within;
    });
    if (!twin) kept.push(s);
  }
  return kept;
}

function score(cells: readonly Cell[], templates: readonly Template[]) {
  let right = 0;
  let wrong = 0;
  let unsure = 0;
  const misses: string[] = [];
  for (const c of cells) {
    const text = readGlyphs(c.segments, templates);
    if (text === null) {
      unsure += 1;
      const why = c.segments.map((s) => (s.char ? s.char : ((m) => `${m.char}:${m.distance.toFixed(1)}/${m.rival.toFixed(1)}${trusted(m) ? "" : "?"}`)(classify(s.features, templates))));
      misses.push(`unsure ${c.label} want ${c.want}: ${why.join(" ")}`);
    } else if (text === c.want) right += 1;
    else {
      wrong += 1;
      misses.push(`WRONG ${c.label}: read ${text} want ${c.want}`);
    }
  }
  return { right, wrong, unsure, misses };
}

let cells: Cell[] = [];

beforeAll(async () => {
  for (const [set, { files, expected }] of SETS.entries()) {
    for (const file of files) {
      const grey = (await decode(readFileSync(file)))!;
      // Total Points uses a stylised display font; the reader computes it from the six categories instead.
      for (const { row, y } of (await locateRows(grey)).filter((r) => r.row.keys[0] !== "total_points")) {
        for (let col = 0; col < 3; col += 1) {
          cells.push({
            set,
            label: `${SETS[set].name} ${row.label} #${col + 1}`,
            want: expectedText(row, expected[col]),
            segments: segmentCell(grey, cellRegion(grey, col, y)),
          });
        }
      }
    }
  }
  cells = cells.filter((c) => !c.want.includes("undefined"));
}, 120_000);

describe("glyph templates for the 3v3 stat table", () => {
  it("cuts nearly every cell into exactly its characters", () => {
    const off = cells.filter((c) => c.segments.length !== c.want.length);
    expect(cells.length).toBeGreaterThan(150);
    expect(off.map((c) => `${c.label}: ${c.segments.length} glyphs for ${c.want}`)).toEqual([]);
  });

  it("never trusts a wrong reading on a match it was not trained on, with room to spare", () => {
    for (const test of [0, 1]) {
      const samples = samplesOf(cells.filter((c) => c.set !== test));
      const unseen = cells.filter((c) => c.set === test);
      const r = score(unseen, samples);
      const report = `train on ${SETS[1 - test].name} → read ${SETS[test].name}: right ${r.right}, wrong ${r.wrong}, unsure ${r.unsure}\n${r.misses.join("\n")}`;
      expect(r.wrong, report).toBe(0);
      expect(r.unsure, report).toBe(0);
      // Correct glyphs must stay well inside the trust limits, so a third device has headroom.
      const matches = unseen.flatMap((c) => c.segments.filter((g) => !g.char).map((g) => classify(g.features, samples)));
      expect(Math.max(...matches.map((m) => m.distance))).toBeLessThanOrEqual(0.9 * TRUST.maxDistance);
      expect(Math.min(...matches.map((m) => m.rival / m.distance))).toBeGreaterThanOrEqual(1.1 * TRUST.minMarginRatio);
    }
  });

  it.runIf(process.env.TRAIN_GLYPHS === "1")("writes the templates from both matches", () => {
    const templates = prune(samplesOf(cells));
    writeFileSync(TEMPLATE_PATH, `${JSON.stringify(encodeTemplates(templates))}\n`);
    expect(templates.length).toBeGreaterThan(20);
  });

  it("the shipped templates load, cover every character, and read every cell of both matches", () => {
    expect(existsSync(TEMPLATE_PATH)).toBe(true);
    const templates = decodeTemplates(JSON.parse(readFileSync(TEMPLATE_PATH, "utf8")) as TemplateFile);
    const perChar = new Map<string, number>();
    for (const t of templates) perChar.set(t.char, (perChar.get(t.char) ?? 0) + 1);
    expect(Math.min(...[..."0123456789()%"].map((c) => perChar.get(c) ?? 0))).toBeGreaterThanOrEqual(5);
    const r = score(cells, templates);
    expect(r.wrong, r.misses.join("\n")).toBe(0);
    expect(r.unsure, r.misses.join("\n")).toBeLessThanOrEqual(2);
  });
});
