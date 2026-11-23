import type { Grey, Region } from "./fulltime";

/**
 * Fast digit reader for the eFootball stat tables. The game draws every
 * number in the same typeface, so instead of running a general OCR engine
 * each cell is cut into glyphs and every glyph is matched against labelled
 * samples cut from real screenshots (glyph-templates.json). A cell takes
 * well under a millisecond. Any glyph that is not a clear match makes the
 * whole cell "unsure", and the caller falls back to Tesseract (then AI).
 */

/** Glyph bitmap size after normalisation. */
export const GW = 12;
export const GH = 18;
/** Extra features after the bitmap: width ÷ height, and height ÷ the text band. */
const SHAPE_WEIGHT = 4;
export const FEATURES = GW * GH + 2;

/** Lowest contrast (max − min grey) that can hold text. */
const MIN_CONTRAST = 60;
/** A blob shorter than this share of the text band, and not a minus sign, is a speck. */
const MIN_GLYPH_HEIGHT = 0.3;

export interface Segment {
  /** Set for glyphs recognised by shape alone (the minus sign). */
  char?: string;
  features: Float32Array;
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Splits one table cell into glyphs, left to right. Empty when the cell has no text. */
export function segmentCell(grey: Grey, region: Region): Segment[] {
  const { left: L, top: T, width: W, height: H } = region;
  if (W <= 0 || H <= 0) return [];
  let min = 255;
  let max = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const v = grey.data[(T + y) * grey.width + L + x];
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (max - min < MIN_CONTRAST) return [];
  const cut = (min + max) / 2;
  const mask = new Uint8Array(W * H);
  let lit = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const on = grey.data[(T + y) * grey.width + L + x] > cut ? 1 : 0;
      mask[y * W + x] = on;
      lit += on;
    }
  }
  // Text is light on the dark rows; a highlighted cell may be the other way round.
  if (lit > mask.length / 2) for (let i = 0; i < mask.length; i += 1) mask[i] ^= 1;

  // Fail closed: text cut off by the cell edge could read as a shorter, valid number.
  const band = textBand(mask, W, H);
  if (!band || band.y0 === 0 || band.y1 === H - 1) return [];
  const bandH = band.y1 - band.y0 + 1;
  const blobs = columnBlobs(mask, W, band);
  if (blobs.some((b) => b.x0 === 0 || b.x1 === W - 1)) return [];

  const out: Segment[] = [];
  for (const b of blobs) {
    const w = b.x1 - b.x0 + 1;
    const h = b.y1 - b.y0 + 1;
    const mid = (b.y0 + b.y1) / 2;
    const flat = h >= 2 && h <= 0.3 * bandH && w >= 1.5 * h && mid > band.y0 + 0.3 * bandH && mid < band.y1 - 0.3 * bandH;
    if (flat) {
      // A minus sign only ever leads the number; a flat mark anywhere else is unexplained.
      if (out.length > 0) return [];
      out.push({ char: "-", features: new Float32Array(FEATURES) });
      continue;
    }
    if (h < MIN_GLYPH_HEIGHT * bandH) continue;
    out.push({ features: featuresOf(mask, W, b, bandH) });
  }
  // A lone minus is not a number.
  return out.length === 1 && out[0].char === "-" ? [] : out;
}

/** The run of inked rows nearest the cell's centre (rows of neighbouring cells may bleed in at the edges). */
function textBand(mask: Uint8Array, W: number, H: number): { y0: number; y1: number } | null {
  const runs: Array<{ y0: number; y1: number }> = [];
  for (let y = 0; y < H; y += 1) {
    let any = false;
    for (let x = 0; x < W && !any; x += 1) any = mask[y * W + x] === 1;
    if (!any) continue;
    const last = runs.at(-1);
    if (last && y - last.y1 <= 2) last.y1 = y;
    else runs.push({ y0: y, y1: y });
  }
  const tall = runs.filter((r) => r.y1 - r.y0 + 1 >= 0.15 * H);
  if (tall.length === 0) return null;
  const centre = H / 2;
  return tall.reduce((a, b) => (Math.abs((a.y0 + a.y1) / 2 - centre) <= Math.abs((b.y0 + b.y1) / 2 - centre) ? a : b));
}

/** Blobs separated by empty columns inside the text band, each with its tight box. */
function columnBlobs(mask: Uint8Array, W: number, band: { y0: number; y1: number }): Box[] {
  const inked = (x: number) => {
    for (let y = band.y0; y <= band.y1; y += 1) if (mask[y * W + x]) return true;
    return false;
  };
  const out: Box[] = [];
  for (let x = 0; x < W; ) {
    if (!inked(x)) {
      x += 1;
      continue;
    }
    let x1 = x;
    while (x1 + 1 < W && inked(x1 + 1)) x1 += 1;
    let y0 = band.y1;
    let y1 = band.y0;
    for (let y = band.y0; y <= band.y1; y += 1) {
      for (let xx = x; xx <= x1; xx += 1) {
        if (!mask[y * W + xx]) continue;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    out.push({ x0: x, x1, y0, y1 });
    x = x1 + 1;
  }
  return out;
}

/** Ink coverage of each cell of a GW×GH grid laid over the glyph, plus its shape. */
function featuresOf(mask: Uint8Array, W: number, b: Box, bandH: number): Float32Array {
  const w = b.x1 - b.x0 + 1;
  const h = b.y1 - b.y0 + 1;
  const f = new Float32Array(FEATURES);
  for (let j = 0; j < GH; j += 1) {
    const ya = b.y0 + (j * h) / GH;
    const yb = b.y0 + ((j + 1) * h) / GH;
    for (let i = 0; i < GW; i += 1) {
      const xa = b.x0 + (i * w) / GW;
      const xb = b.x0 + ((i + 1) * w) / GW;
      let ink = 0;
      let n = 0;
      for (let y = Math.floor(ya); y < Math.max(Math.floor(ya) + 1, Math.ceil(yb)); y += 1) {
        for (let x = Math.floor(xa); x < Math.max(Math.floor(xa) + 1, Math.ceil(xb)); x += 1) {
          ink += mask[y * W + x];
          n += 1;
        }
      }
      f[j * GW + i] = ink / n;
    }
  }
  f[GW * GH] = (w / h) * SHAPE_WEIGHT;
  f[GW * GH + 1] = (h / bandH) * SHAPE_WEIGHT;
  return f;
}

export interface Template {
  char: string;
  features: Float32Array;
}

export interface Match {
  char: string;
  /** L1 distance to the nearest sample. */
  distance: number;
  /** Distance to the nearest sample of any other character. */
  rival: number;
}

export function classify(features: Float32Array, templates: readonly Template[]): Match {
  const best = new Map<string, number>();
  for (const t of templates) {
    let d = 0;
    for (let i = 0; i < FEATURES; i += 1) d += Math.abs(features[i] - t.features[i]);
    if (d < (best.get(t.char) ?? Infinity)) best.set(t.char, d);
  }
  const ranked = [...best.entries()].sort((a, b) => a[1] - b[1]);
  const [first, second] = ranked;
  return { char: first?.[0] ?? "?", distance: first?.[1] ?? Infinity, rival: second?.[1] ?? Infinity };
}

/** Thresholds for trusting a match, tuned on real screenshots (see tests/ocr/glyphs.test.ts). */
export const TRUST = {
  /** Nearest sample must be at least this close… */
  maxDistance: 30,
  /** …and the nearest other character this much farther away, relatively. */
  minMarginRatio: 1.6,
} as const;

export function trusted(m: Match): boolean {
  return m.distance <= TRUST.maxDistance && m.rival >= m.distance * TRUST.minMarginRatio;
}

/** Reads a cell's text, or null when any glyph is not a clear match. */
export function readGlyphs(segments: readonly Segment[], templates: readonly Template[]): string | null {
  if (segments.length === 0) return null;
  let text = "";
  for (const s of segments) {
    if (s.char) {
      text += s.char;
      continue;
    }
    const m = classify(s.features, templates);
    if (!trusted(m)) return null;
    text += m.char;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Template storage: features quantised to bytes, base64 per sample.
// ---------------------------------------------------------------------------

export interface TemplateFile {
  gw: number;
  gh: number;
  samples: Array<{ c: string; f: string }>;
}

const SHAPE_SCALE = 25;

export function encodeTemplates(templates: readonly Template[]): TemplateFile {
  return {
    gw: GW,
    gh: GH,
    samples: templates.map((t) => {
      const bytes = Buffer.alloc(FEATURES);
      for (let i = 0; i < FEATURES; i += 1) {
        const v = i < GW * GH ? t.features[i] * 255 : t.features[i] * SHAPE_SCALE;
        bytes[i] = Math.max(0, Math.min(255, Math.round(v)));
      }
      return { c: t.char, f: bytes.toString("base64") };
    }),
  };
}

export function decodeTemplates(file: TemplateFile): Template[] {
  if (file.gw !== GW || file.gh !== GH) return [];
  return file.samples.map((s) => {
    const bytes = Buffer.from(s.f, "base64");
    const features = new Float32Array(FEATURES);
    for (let i = 0; i < FEATURES; i += 1) features[i] = i < GW * GH ? bytes[i] / 255 : bytes[i] / SHAPE_SCALE;
    return { char: s.c, features };
  });
}
