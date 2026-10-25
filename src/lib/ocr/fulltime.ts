import "server-only";

import { join } from "node:path";
import sharp from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { emptyDraftSide, validateSides, type DraftSide } from "@/lib/domain/validation";
import type { StatKey } from "@/lib/domain/types";

/**
 * Reads the eFootball "Full Time" stats screen with local OCR (tesseract.js),
 * so the common case costs no AI tokens. The screen layout is fixed: it is
 * centred horizontally and scales with the image height, so every region is
 * expressed relative to the height and the horizontal centre. Calibrated on a
 * real 2000×924 screenshot; works for any landscape aspect ratio.
 */

const ROWS: Array<StatKey> = [
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
];

const GEOMETRY = {
  firstRowY: 0.2955,
  rowStep: 0.0445,
  rowHalfHeight: 0.019,
  valueHalfWidth: 0.075,
  leftValueX: -0.263,
  rightValueX: 0.26,
  scoreY: 0.189,
  // Inside the white score boxes, clear of their edges.
  scoreHalf: { w: 0.025, h: 0.026 },
  leftScoreX: -0.079,
  rightScoreX: 0.077,
  labelTop: 0.152,
  labelHeight: 0.075,
  leftLabel: { from: -0.36, width: 0.225 },
  rightLabel: { from: 0.135, width: 0.26 },
} as const;

/** Below this OCR confidence a value is treated as unreadable. */
const MIN_CONFIDENCE = 70;
/** The big single-digit score glyphs read with lower confidence; they get an extra sanity check instead. */
const MIN_SCORE_CONFIDENCE = 55;
/** Score crops are already large glyphs: read them near native size. */
const SCORE_HEIGHT = 50;
/** Bigger screenshots are scaled down once; the layout is relative to the height, so reads are unaffected. */
const MAX_HEIGHT = 1200;
/** A full read normally takes 1–4 s; past this the workers are assumed stuck and recreated. */
const READ_TIMEOUT_MS = 30_000;
/**
 * The three workers hold ~140 MB. Railway bills RAM by the minute, so they are
 * unloaded after this long without a read; the next read reloads them (~1–2 s).
 * OCR_IDLE_MS overrides it (tests use a short value).
 */
const DEFAULT_IDLE_MS = 5 * 60_000;
const idleMs = () => Number(process.env.OCR_IDLE_MS) || DEFAULT_IDLE_MS;

type Region = { left: number; top: number; width: number; height: number };
/** The screenshot decoded once to 8-bit greyscale; every crop is cut from this buffer. */
type Grey = { data: Buffer; width: number; height: number };

const dataDir = (lang: "eng" | "tha") =>
  join(/*turbopackIgnore: true*/ process.cwd(), "node_modules", "@tesseract.js-data", lang, "4.0.0_best_int");

interface Workers {
  digits: Worker;
  eng: Worker;
  tha: Worker;
}

declare global {
  var __rivalryOcr: Promise<Workers> | undefined;
}

/** Long-lived workers (created once per server process; ~1 s warm-up). */
function workers(): Promise<Workers> {
  globalThis.__rivalryOcr ??= (async () => {
    const opts = (lang: "eng" | "tha") => ({ langPath: dataDir(lang), cacheMethod: "none" as const, gzip: true });
    const [digits, eng, tha] = await Promise.all([
      createWorker("eng", 1, opts("eng")),
      createWorker("eng", 1, opts("eng")),
      createWorker("tha", 1, opts("tha")),
    ]);
    // Crops carry no DPI metadata; without this Tesseract logs a warning for every read.
    const dpi = { user_defined_dpi: "300" };
    await digits.setParameters({ ...dpi, tessedit_char_whitelist: "0123456789%", tessedit_pageseg_mode: PSM.SINGLE_LINE });
    await eng.setParameters({ ...dpi, tessedit_pageseg_mode: PSM.SINGLE_LINE });
    await tha.setParameters({ ...dpi, tessedit_pageseg_mode: PSM.SINGLE_WORD });
    return { digits, eng, tha };
  })().catch((err) => {
    globalThis.__rivalryOcr = undefined;
    throw err;
  });
  return globalThis.__rivalryOcr;
}

/** Drops the cached workers (after a crash or timeout) so the next read starts fresh. */
async function resetWorkers(): Promise<void> {
  const pending = globalThis.__rivalryOcr;
  globalThis.__rivalryOcr = undefined;
  const w = await pending?.catch(() => null);
  if (w) await Promise.allSettled([w.digits.terminate(), w.eng.terminate(), w.tha.terminate()]);
}

declare global {
  var __rivalryOcrQueue: Promise<unknown> | undefined;
  var __rivalryOcrIdle: NodeJS.Timeout | undefined;
}

/** True while the OCR workers are in memory (or loading). */
export function ocrWorkersLoaded(): boolean {
  return globalThis.__rivalryOcr !== undefined;
}

/** (Re)starts the idle countdown; the unload runs through the queue so it never interrupts a read. */
function scheduleUnload(): void {
  clearTimeout(globalThis.__rivalryOcrIdle);
  globalThis.__rivalryOcrIdle = setTimeout(() => void enqueue(resetWorkers), idleMs());
  // Don't keep the process (or a test run) alive just for this timer.
  globalThis.__rivalryOcrIdle.unref?.();
}

/** One read at a time: the workers are shared, and queuing keeps CPU and memory bounded under bursts. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = (globalThis.__rivalryOcrQueue ?? Promise.resolve()).then(job, job);
  globalThis.__rivalryOcrQueue = run.catch(() => undefined);
  return run;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`OCR timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function regions(width: number, height: number) {
  const cx = width / 2;
  const g = GEOMETRY;
  const box = (xOff: number, cy: number, hw: number, hh: number): Region => ({
    left: Math.round(cx + xOff * height - hw * height),
    top: Math.round(cy * height - hh * height),
    width: Math.round(2 * hw * height),
    height: Math.round(2 * hh * height),
  });
  const rowY = (i: number) => g.firstRowY + i * g.rowStep;
  return {
    score: {
      left: box(g.leftScoreX, g.scoreY, g.scoreHalf.w, g.scoreHalf.h),
      right: box(g.rightScoreX, g.scoreY, g.scoreHalf.w, g.scoreHalf.h),
    },
    rows: ROWS.map((key, i) => ({
      key,
      left: box(g.leftValueX, rowY(i), g.valueHalfWidth, g.rowHalfHeight),
      right: box(g.rightValueX, rowY(i), g.valueHalfWidth, g.rowHalfHeight),
    })),
    label: {
      left: {
        left: Math.round(cx + g.leftLabel.from * height),
        top: Math.round(g.labelTop * height),
        width: Math.round(g.leftLabel.width * height),
        height: Math.round(g.labelHeight * height),
      },
      right: {
        left: Math.round(cx + g.rightLabel.from * height),
        top: Math.round(g.labelTop * height),
        width: Math.round(g.rightLabel.width * height),
        height: Math.round(g.labelHeight * height),
      },
    },
  };
}

/** Contrast cut-offs tried in order until a read is confident. */
const THRESHOLDS = [150, 115, 185] as const;

/**
 * Crop → greyscale → resize to a fixed pixel height (resolution-independent;
 * small stat digits are enlarged, the big score glyph is not) → dark-on-light
 * → threshold → white padding.
 */
async function prepare(grey: Grey, region: Region, threshold: number = THRESHOLDS[0], targetHeight = 105): Promise<Buffer> {
  let sum = 0;
  for (let y = region.top; y < region.top + region.height; y++) {
    const row = y * grey.width;
    for (let x = region.left; x < region.left + region.width; x++) sum += grey.data[row + x];
  }
  const mean = sum / (region.width * region.height);
  let img = sharp(grey.data, { raw: { width: grey.width, height: grey.height, channels: 1 } })
    .extract(region)
    .resize({ height: targetHeight, width: Math.round((region.width * targetHeight) / region.height), kernel: "lanczos3" });
  if (mean < 128) img = img.negate();
  const bw = await img.normalise().threshold(threshold).png().toBuffer();
  // Separate pass: within one pipeline sharp applies extend before negate.
  return sharp(bw).extend({ top: 24, bottom: 24, left: 24, right: 24, background: "#ffffff" }).png().toBuffer();
}

function parseNumber(text: string, percent: boolean): number | null {
  const t = text.replace(/\s/g, "");
  const m = percent ? t.match(/^(\d{1,3})%?$/) : t.match(/^(\d{1,4})$/);
  return m ? Number(m[1]) : null;
}

export interface LabelCandidate {
  text: string;
  confidence: number;
  lang: "eng" | "tha";
}

export interface OcrRead {
  left: DraftSide;
  right: DraftSide;
  /** Raw label reads for name matching (Latin and Thai models). */
  labelCandidates: { left: LabelCandidate[]; right: LabelCandidate[] };
  /** True when every number was read confidently and passes the consistency checks. */
  complete: boolean;
  problems: string[];
  ms: number;
}

async function decode(source: Buffer): Promise<Grey | null> {
  const { width, height } = await sharp(source).metadata();
  if (!width || !height || width < height) return null;
  const { data, info } = await sharp(source)
    .resize({ height: Math.min(height, MAX_HEIGHT), withoutEnlargement: true })
    .greyscale()
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Queued, time-limited read; a failed or stuck read recreates the workers before rethrowing. */
export function readFullTimeScreen(source: Buffer): Promise<OcrRead> {
  return enqueue(async () => {
    clearTimeout(globalThis.__rivalryOcrIdle);
    try {
      return await withTimeout(read(source), READ_TIMEOUT_MS);
    } catch (err) {
      await resetWorkers();
      throw err;
    } finally {
      if (ocrWorkersLoaded()) scheduleUnload();
    }
  });
}

async function read(source: Buffer): Promise<OcrRead> {
  const t0 = Date.now();
  const grey = await decode(source);
  if (!grey) {
    return { left: emptyDraftSide(), right: emptyDraftSide(), labelCandidates: { left: [], right: [] }, complete: false, problems: ["not a landscape screenshot"], ms: 0 };
  }
  const r = regions(grey.width, grey.height);
  const w = await workers();
  const problems: string[] = [];
  const left = emptyDraftSide();
  const right = emptyDraftSide();

  const readNumber = async (region: Region, percent: boolean, name: string, minConfidence: number = MIN_CONFIDENCE, targetHeight = 105) => {
    let best: { value: number | null; confidence: number; text: string } = { value: null, confidence: -1, text: "" };
    for (const threshold of THRESHOLDS) {
      const { data } = await w.digits.recognize(await prepare(grey, region, threshold, targetHeight));
      const value = parseNumber(data.text, percent);
      if (value !== null && data.confidence > best.confidence) best = { value, confidence: data.confidence, text: data.text };
      if (value !== null && data.confidence >= minConfidence) return value;
      if (best.value === null && data.confidence > best.confidence) best = { value: null, confidence: data.confidence, text: data.text };
    }
    problems.push(`${name}: "${best.text.trim()}" (${Math.round(best.confidence)})`);
    return null;
  };

  left.goals = await readNumber(r.score.left, false, "left goals", MIN_SCORE_CONFIDENCE, SCORE_HEIGHT);
  right.goals = await readNumber(r.score.right, false, "right goals", MIN_SCORE_CONFIDENCE, SCORE_HEIGHT);
  for (const row of r.rows) {
    const percent = row.key === "possession_pct";
    left[row.key] = await readNumber(row.left, percent, `left ${row.key}`);
    right[row.key] = await readNumber(row.right, percent, `right ${row.key}`);
  }

  const labelCandidates: OcrRead["labelCandidates"] = { left: [], right: [] };
  for (const side of ["left", "right"] as const) {
    const png = await prepare(grey, r.label[side]);
    for (const [lang, worker] of [["eng", w.eng], ["tha", w.tha]] as const) {
      const { data } = await worker.recognize(png);
      const text = data.text.trim();
      if (text) labelCandidates[side].push({ text, confidence: data.confidence, lang });
    }
  }

  // Score sanity check (own goals are rare; if it trips, the AI fallback re-reads the screen).
  for (const [name, side] of [["left", left], ["right", right]] as const) {
    if (side.goals !== null && side.shots_on_target !== null && side.goals > side.shots_on_target) {
      problems.push(`${name} goals exceed shots on target`);
    }
  }

  for (const issue of validateSides(left, right)) {
    if (issue.severity === "error") problems.push(issue.message);
  }
  if (left.possession_pct !== null && right.possession_pct !== null && Math.abs(left.possession_pct + right.possession_pct - 100) > 1) {
    problems.push("possession does not add up to 100%");
  }

  return { left, right, labelCandidates, complete: problems.length === 0, problems, ms: Date.now() - t0 };
}
