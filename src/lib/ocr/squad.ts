import "server-only";

import sharp from "sharp";
import { PSM, type Worker } from "tesseract.js";
import {
  categorySum,
  matchRowLabel,
  parseCell,
  type AwardTier,
  type SquadAward,
  type SquadRow,
  type SquadScreenRead,
  type SquadStats,
} from "@/lib/domain/squad";
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
import { decodeTemplates, readGlyphs, segmentCell, type TemplateFile } from "./glyphs";
import templateFile from "./glyph-templates.json";

/** Digit samples cut from real screenshots (retrain with tests/ocr/glyphs.test.ts). */
const TEMPLATES = decodeTemplates(templateFile as TemplateFile);

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
  /** Cells the fast glyph matcher was unsure of, read by Tesseract instead. */
  slowCells?: number;
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

/** The region of one stat cell: player column `column` (0–2) on the row centred at `y`. */
export function cellRegion(grey: Grey, column: number, y: number): Region {
  const g = GEOMETRY;
  return box(grey, g.columns[column], y, g.cellHalfWidth, g.cellHalfHeight);
}

/** Row labels of a table screenshot with their heights (used to train the glyph templates). */
export function locateRows(grey: Grey): Promise<Array<{ row: SquadRow; y: number }>> {
  return runOcrJob((w) => findRowsInColumnMode(grey, w.eng));
}

async function findRowsInColumnMode(grey: Grey, worker: Worker): Promise<Array<{ row: SquadRow; y: number }>> {
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN });
  try {
    return await findRows(grey, worker);
  } finally {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
  }
}

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
    if (!/\d/.test(s.text)) return true;
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
      const text = row.keys[0] === "total_points" ? data.text.replace(/\(\)/g, "0") : data.text;
      seen.push(text.trim());
      const signed = row.group === "rating";
      const values = parseCell(text, row.format, signed);
      if (!values || values.some((v) => Math.abs(v) > row.max) || data.confidence < MIN_VOTE_CONFIDENCE) continue;
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
  // Two reads at different scales that agree, with nothing else read at all, are enough.
  if (top && !next && top.n >= 2 && top.heights.size >= 2) return { values: top.values, note: "" };
  return { values: null, note: ranked.length ? ranked.map((v) => `${v.values.join("/")}×${v.n}`).join(" ") : `"${seen.find(Boolean) ?? ""}"` };
}

/**
 * Fast path: the cell's glyphs matched against the digit templates. Null
 * when any glyph is unclear or the number doesn't fit the row, so the caller
 * can fall back to Tesseract.
 */
export function readCellFast(grey: Grey, region: Region, row: SquadRow): number[] | null {
  const text = readGlyphs(segmentCell(grey, region), TEMPLATES);
  if (text === null) return null;
  const signed = row.group === "rating";
  const values = parseCell(text.replace("(", " ("), row.format, signed);
  if (!values || values.some((v) => v > row.max || v < (signed ? -row.max : 0))) return null;
  // Every pair is "total (successful part)".
  if (row.format === "pair" && values[1] > values[0]) return null;
  return values;
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

  const rows = await findRowsInColumnMode(grey, w.eng);
  if (rows.length < MIN_ROWS) {
    const awards = await readAwards(source, w);
    if (awards) return { ...empty, names: awards.names, awards: awards.titles, ms: Date.now() - t0 };
    return { ...empty, problems: ["no squad stats table found"], ms: Date.now() - t0 };
  }

  const g = GEOMETRY;
  const problems: string[] = [];
  const values: SquadScreenRead["values"] = {};
  const { cells, slowCells } = await readTableCells(grey, rows, w.digits, problems);
  for (const { row } of rows) {
    row.keys.forEach((key, k) => {
      values[key] = cells.get(row)!.map((c) => (c ? c[k] : null));
    });
  }

  const nameY = g.names.top + g.names.height / 2;
  const names: Array<string | null> = [];
  for (const x of g.columns) names.push(await readText(grey, box(grey, x, nameY, g.names.halfWidth, g.names.height / 2), w.eng));
  const team = await readText(grey, box(grey, g.team.from + g.team.width / 2, nameY, g.team.width / 2, g.names.height / 2), w.eng);

  return { names, team, values, rows: rows.map((r) => r.row.label), problems, ms: Date.now() - t0, slowCells };
}

const isTotal = (row: SquadRow) => row.keys[0] === "total_points";

/**
 * Every cell of the rows found: glyph templates first (well under a
 * millisecond a cell), Tesseract's voting reader only for cells they can't
 * vouch for. Total Points, in a stylised font, is never OCR-ed: it is the
 * sum of the six evaluation categories (here when this screen has them all,
 * otherwise when the screens are merged).
 */
async function readTableCells(
  grey: Grey,
  rows: ReadonlyArray<{ row: SquadRow; y: number }>,
  digits: Worker,
  problems: string[],
): Promise<{ cells: Map<SquadRow, Array<number[] | null>>; slowCells: number }> {
  const cells = new Map<SquadRow, Array<number[] | null>>();
  const pending: Array<{ row: SquadRow; y: number; col: number }> = [];
  for (const { row, y } of rows) {
    const line = GEOMETRY.columns.map((_, col) => (isTotal(row) ? null : readCellFast(grey, cellRegion(grey, col, y), row)));
    line.forEach((v, col) => {
      if (v === null) pending.push({ row, y, col });
    });
    cells.set(row, line);
  }

  const columnStats = (col: number): SquadStats =>
    Object.fromEntries([...cells].flatMap(([row, line]) => row.keys.map((key, k) => [key, line[col]?.[k] ?? null]))) as SquadStats;
  let slowCells = 0;
  let whitelisted = false;
  const slowRead = async ({ row, y, col }: { row: SquadRow; y: number; col: number }) => {
    if (!whitelisted) {
      whitelisted = true; // before the await, so a failed call still restores the whitelist
      await digits.setParameters({ tessedit_char_whitelist: "0123456789()%- " });
    }
    slowCells += 1;
    const cell = await readCell(grey, cellRegion(grey, col, y), row, digits);
    if (!cell.values) problems.push(`${row.label} #${col + 1}: ${cell.note}`);
    cells.get(row)![col] = cell.values;
  };
  try {
    for (const p of pending.filter((p) => !isTotal(p.row))) await slowRead(p);
    // Not worth OCR (Tesseract rarely agrees on that font): mergeScreenReads sums the categories across screens.
    for (const p of pending.filter((p) => isTotal(p.row))) cells.get(p.row)![p.col] = ((sum) => (sum === null ? null : [sum]))(categorySum(columnStats(p.col)));
  } finally {
    if (whitelisted) await digits.setParameters({ tessedit_char_whitelist: DIGIT_WHITELIST });
  }
  return { cells, slowCells };
}

// ---------------------------------------------------------------------------
// Co-op Awards screen: three columns (avatar + name) with up to three title
// pills each, coloured gold / silver (blue-grey) / bronze (brown).
// ---------------------------------------------------------------------------

const AWARDS = {
  title: { from: -0.73, width: 0.5, top: 0.105, height: 0.07 },
  columns: [-0.595, 0, 0.593],
  name: { offset: -0.1, width: 0.34, y: 0.27, halfHeight: 0.04 },
  pills: [0.431, 0.585, 0.742],
  pillHalf: { w: 0.235, h: 0.055 },
  textHalf: { w: 0.215, h: 0.034 },
} as const;
const MAX_HEIGHT = 1200;

interface Rgb {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * The screenshot as RGB plus a "min channel" greyscale: white text stays
 * bright while every coloured pill turns dark, so the titles threshold
 * cleanly whatever the pill colour.
 */
async function decodeRgb(source: Buffer): Promise<{ rgb: Rgb; grey: Grey } | null> {
  const { width, height } = await sharp(source).metadata();
  if (!width || !height || width < height) return null;
  const { data, info } = await sharp(source)
    .resize({ height: Math.min(height, MAX_HEIGHT), withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const min = Buffer.alloc(info.width * info.height);
  for (let i = 0, p = 0; i < min.length; i += 1, p += 3) min[i] = Math.min(data[p], data[p + 1], data[p + 2]);
  return { rgb: { data, width: info.width, height: info.height }, grey: { data: min, width: info.width, height: info.height } };
}

/** Pill colour → tier: blue-grey = silver, bright orange/yellow = gold, dark brown = bronze. */
export function tierFromColour(r: number, g: number, b: number): AwardTier {
  if (b > r) return "silver";
  if (r > 170 && g / Math.max(1, r) > 0.5) return "gold";
  return "bronze";
}

function meanRgb(rgb: Rgb, region: Region): [number, number, number] {
  const sum = [0, 0, 0];
  for (let y = region.top; y < region.top + region.height; y += 1) {
    for (let x = region.left; x < region.left + region.width; x += 1) {
      const p = (y * rgb.width + x) * 3;
      sum[0] += rgb.data[p];
      sum[1] += rgb.data[p + 1];
      sum[2] += rgb.data[p + 2];
    }
  }
  const n = Math.max(1, region.width * region.height);
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

async function readAwards(source: Buffer, w: Workers): Promise<{ names: Array<string | null>; titles: SquadAward[][] } | null> {
  const decoded = await decodeRgb(source);
  if (!decoded) return null;
  const { rgb, grey } = decoded;
  const a = AWARDS;
  const h = grey.height;
  const titleRegion: Region = {
    left: Math.max(0, Math.round(grey.width / 2 + a.title.from * h)),
    top: Math.round(a.title.top * h),
    width: Math.round(a.title.width * h),
    height: Math.round(a.title.height * h),
  };
  const title = await readText(grey, titleRegion, w.eng);
  if (!title || !/co.?op/i.test(title) || !/award/i.test(title)) return null;

  const names: Array<string | null> = [];
  const titles: SquadAward[][] = [];
  for (const c of a.columns) {
    const nameRegion: Region = {
      left: Math.max(0, Math.round(grey.width / 2 + (c + a.name.offset) * h)),
      top: Math.round((a.name.y - a.name.halfHeight) * h),
      width: Math.round(a.name.width * h),
      height: Math.round(2 * a.name.halfHeight * h),
    };
    names.push(await readText(grey, nameRegion, w.eng));
    const list: SquadAward[] = [];
    for (const y of a.pills) {
      const text = await readText(grey, box(grey, c, y, a.textHalf.w, a.textHalf.h), w.eng);
      if (!text || text.length < 3) continue;
      const [r, g, b] = meanRgb(rgb, box(grey, c, y, a.pillHalf.w, a.pillHalf.h));
      list.push({ title: text.slice(0, 40), tier: tierFromColour(r, g, b) });
    }
    titles.push(list);
  }
  return titles.some((l) => l.length > 0) ? { names, titles } : null;
}

/** Queued, time-limited read of one squad-table screenshot. */
export function readSquadScreen(source: Buffer): Promise<SquadOcrResult> {
  return runOcrJob((w) => read(source, w), 60_000);
}
