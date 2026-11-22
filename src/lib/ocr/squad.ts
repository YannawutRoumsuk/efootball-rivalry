import "server-only";

import { PSM, type Worker } from "tesseract.js";
import { matchRowLabel, parseCell, type SquadRow, type SquadScreenRead } from "@/lib/domain/squad";
import {
  decode,
  DIGIT_WHITELIST,
  prepare,
  runOcrJob,
  THRESHOLDS,
  type Grey,
  type Region,
  type Workers,
} from "./fulltime";

/**
 * Reads one screenshot of the PvP 3v3 post-match table ("Total Points",
 * "Offensive Positioning" … "Players Marked"). The table scrolls, so rows are
 * found by reading the label column; each row's three cells are then read at
 * that height. Like the Full Time screen, the layout is centred horizontally
 * and scales with the image height. Calibrated on 2000×924 screenshots.
 */

const GEOMETRY = {
  /** Horizontal centre of each player column, as a multiple of the height from the image centre. */
  columns: [-0.2955, 0.171, 0.6374],
  cellHalfWidth: 0.17,
  cellHalfHeight: 0.04,
  labels: { from: -0.85, width: 0.38, top: 0.19, height: 0.67 },
  names: { top: 0.105, height: 0.075, halfWidth: 0.19 },
  team: { from: -0.73, width: 0.19 },
} as const;

const CELL_HEIGHT = 90;
const MIN_NAME_CONFIDENCE = 60;
/** A screenshot with fewer recognised row labels is not the squad table. */
const MIN_ROWS = 2;

export interface SquadOcrResult extends SquadScreenRead {
  /** Rows recognised, in screen order (for the review screen and debugging). */
  rows: string[];
  problems: string[];
  ms: number;
}

const box = (grey: Grey, xOff: number, cy: number, hw: number, hh: number): Region => {
  const h = grey.height;
  const left = Math.max(0, Math.round(grey.width / 2 + (xOff - hw) * h));
  const top = Math.max(0, Math.round((cy - hh) * h));
  return {
    left,
    top,
    width: Math.min(grey.width - left, Math.round(2 * hw * h)),
    height: Math.min(grey.height - top, Math.round(2 * hh * h)),
  };
};

/** Finds the row labels and their vertical centres (as a fraction of the height). */
async function findRows(grey: Grey, worker: Worker): Promise<Array<{ row: SquadRow; y: number }>> {
  const g = GEOMETRY.labels;
  const h = grey.height;
  const region: Region = {
    left: Math.max(0, Math.round(grey.width / 2 + g.from * h)),
    top: Math.round(g.top * h),
    width: Math.round(g.width * h),
    height: Math.round(g.height * h),
  };
  // Native scale: prepare() pads by 24 px, which the line boxes include.
  const png = await prepare(grey, region, THRESHOLDS[0], region.height);
  const { data } = await worker.recognize(png, {}, { blocks: true });
  const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
  const found: Array<{ row: SquadRow; y: number }> = [];
  for (const line of lines) {
    const row = matchRowLabel(line.text);
    if (!row || found.some((f) => f.row === row)) continue;
    const yPx = region.top + (line.bbox.y0 + line.bbox.y1) / 2 - 24;
    found.push({ row, y: yPx / h });
  }
  return found;
}

/**
 * Tesseract is unreliable on short, thin numbers ("1", "11", a lone "4"): one
 * scale may merge "11" into a wide "1" or clip a "4" to its stem. So a cell is
 * read at several scales and contrasts and a value must win a clear vote.
 */
const VOTE_HEIGHTS = [CELL_HEIGHT, 140, 70, 110, 50] as const;
/** Votes (from at least two scales, unopposed) that settle a cell early. */
const EARLY_VOTES = 3;
/** Below this confidence a read doesn't vote. */
const MIN_VOTE_CONFIDENCE = 40;
/** A "1" wider than this (width ÷ height) is two merged glyphs; any digit wider than MAX_DIGIT_RATIO is too. */
const MAX_ONE_RATIO = 0.5;
const MAX_DIGIT_RATIO = 0.85;

interface Symbol {
  text: string;
  bbox: { x0: number; x1: number; y0: number; y1: number };
}

/** False when a glyph is too wide for the digit it was read as (merged glyphs). */
export function plausibleGlyphs(symbols: readonly Symbol[]): boolean {
  return symbols.every((s) => {
    if (!/d/.test(s.text)) return true;
    const ratio = (s.bbox.x1 - s.bbox.x0) / Math.max(1, s.bbox.y1 - s.bbox.y0);
    return ratio <= (s.text === "1" ? MAX_ONE_RATIO : MAX_DIGIT_RATIO);
  });
}

async function readCell(grey: Grey, region: Region, row: SquadRow, worker: Worker): Promise<{ values: number[] | null; note: string }> {
  const votes = new Map<string, { values: number[]; n: number; heights: Set<number> }>();
  const seen: string[] = [];
  for (const height of VOTE_HEIGHTS) {
    for (const threshold of THRESHOLDS) {
      const { data } = await worker.recognize(await prepare(grey, region, threshold, height), {}, { blocks: true });
      // The stylised "0" of the big point totals sometimes reads as "()".
      const text = row.keys[0] === "total_points" ? data.text.replace(/()/g, "0") : data.text;
      seen.push(text.trim());
      const values = parseCell(text, row.format);
      if (!values || values.some((v) => v > row.max) || data.confidence < MIN_VOTE_CONFIDENCE) continue;
      const symbols = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words.flatMap((w) => w.symbols))));
      if (!plausibleGlyphs(symbols)) continue;
      const key = values.join(",");
      const vote = votes.get(key) ?? { values, n: 0, heights: new Set<number>() };
      vote.n += 1;
      vote.heights.add(height);
      votes.set(key, vote);
      if (votes.size === 1 && vote.n >= EARLY_VOTES && vote.heights.size >= 2) return { values, note: "" };
    }
  }
  const ranked = [...votes.values()].sort((a, b) => b.n - a.n);
  const [top, next] = ranked;
  if (top && top.n >= EARLY_VOTES && top.heights.size >= 2 && top.n >= 2 * (next?.n ?? 0)) return { values: top.values, note: "" };
  return { values: null, note: ranked.length ? ranked.map((v) => `${v.values.join("/")}×${v.n}`).join(" ") : `"${seen.find(Boolean) ?? ""}"` };
}

async function readText(grey: Grey, region: Region, worker: Worker): Promise<string | null> {
  for (const threshold of THRESHOLDS) {
    const { data } = await worker.recognize(await prepare(grey, region, threshold, 70));
    const text = data.text.replace(/[|"“”'‘’]/g, "").trim();
    if (text && data.confidence >= MIN_NAME_CONFIDENCE && /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,29}$/u.test(text)) return text;
  }
  return null;
}

async function read(source: Buffer, w: Workers): Promise<SquadOcrResult> {
  const t0 = Date.now();
  const empty: SquadOcrResult = { names: [null, null, null], team: null, values: {}, rows: [], problems: [], ms: 0 };
  const grey = await decode(source);
  if (!grey) return { ...empty, problems: ["not a landscape screenshot"] };

  await w.eng.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
  let rows: Array<{ row: SquadRow; y: number }>;
  try {
    rows = await findRows(grey, w.eng);
  } finally {
    await w.eng.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  }
  if (rows.length < MIN_ROWS) return { ...empty, problems: ["no squad stats table found"], ms: Date.now() - t0 };

  const g = GEOMETRY;
  const problems: string[] = [];
  const values: SquadScreenRead["values"] = {};
  await w.digits.setParameters({ tessedit_char_whitelist: "0123456789()% " });
  try {
    for (const { row, y } of rows) {
      const cells: Array<number[] | null> = [];
      for (const [i, x] of g.columns.entries()) {
        const cell = await readCell(grey, box(grey, x, y, g.cellHalfWidth, g.cellHalfHeight), row, w.digits);
        if (!cell.values) problems.push(`${row.label} #${i + 1}: ${cell.note}`);
        cells.push(cell.values);
      }
      row.keys.forEach((key, k) => {
        values[key] = cells.map((c) => (c ? c[k] : null));
      });
    }
  } finally {
    await w.digits.setParameters({ tessedit_char_whitelist: DIGIT_WHITELIST });
  }

  const nameY = g.names.top + g.names.height / 2;
  const names: Array<string | null> = [];
  for (const x of g.columns) names.push(await readText(grey, box(grey, x, nameY, g.names.halfWidth, g.names.height / 2), w.eng));
  const team = await readText(grey, box(grey, g.team.from + g.team.width / 2, nameY, g.team.width / 2, g.names.height / 2), w.eng);

  return { names, team, values, rows: rows.map((r) => r.row.label), problems, ms: Date.now() - t0 };
}

/** Queued, time-limited read of one squad-table screenshot. */
export function readSquadScreen(source: Buffer): Promise<SquadOcrResult> {
  return runOcrJob((w) => read(source, w), 60_000);
}
