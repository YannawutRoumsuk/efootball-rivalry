import { z } from "zod";
import { AWARD_TIERS, matchRowLabel, parseCell, type SquadAward, type SquadScreenRead } from "./squad";

/**
 * What the vision model reports for one 3v3 screenshot. Cell values come back
 * as the literal text ("29 (16)", "-23", "61%") and are parsed with the same
 * rules as OCR, so the model never decides the format.
 */
const aiSchema = z.object({
  screen: z.enum(["table", "awards", "fulltime", "other"]),
  team: z.string().max(60).nullable(),
  names: z.array(z.string().max(60).nullable()).max(3),
  rows: z
    .array(z.object({ label: z.string().max(60), values: z.array(z.string().max(20).nullable()).max(3) }))
    .max(40),
  awards: z
    .array(z.array(z.object({ title: z.string().min(1).max(40), tier: z.enum(AWARD_TIERS) })).max(6))
    .max(3),
});

export type AiSquadRead = z.infer<typeof aiSchema>;

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : v);
const list = (v: unknown, n: number) => (Array.isArray(v) ? v.slice(0, n) : v);

/** Trims extra columns, rows and over-long text first, so one stray field doesn't discard the whole answer. */
function clamp(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;
  const rows = list(r.rows, 40);
  const awards = list(r.awards, 3);
  return {
    ...r,
    team: clip(r.team, 60),
    names: Array.isArray(r.names) ? r.names.slice(0, 3).map((n) => clip(n, 60)) : r.names,
    rows: Array.isArray(rows)
      ? rows.map((row) =>
          row && typeof row === "object"
            ? { ...row, label: clip((row as Record<string, unknown>).label, 60), values: Array.isArray((row as Record<string, unknown>).values) ? ((row as Record<string, unknown>).values as unknown[]).slice(0, 3).map((x) => clip(x, 20)) : (row as Record<string, unknown>).values }
            : row,
        )
      : rows,
    awards: Array.isArray(awards)
      ? awards.map((col) => (Array.isArray(col) ? col.slice(0, 6).map((a) => (a && typeof a === "object" ? { ...a, title: clip((a as Record<string, unknown>).title, 40) } : a)) : col))
      : awards,
  };
}

export function sanitizeAiSquad(raw: unknown): AiSquadRead | null {
  const parsed = aiSchema.safeParse(clamp(raw));
  return parsed.success ? parsed.data : null;
}

export type ReadWithRows = SquadScreenRead & { rows: string[] };

/** True when OCR left a cell of a row it found unreadable (or found nothing it understood). */
export function needsAiHelp(read: ReadWithRows, isFullTime: boolean): boolean {
  if (isFullTime) return false;
  if (read.awards) return read.awards.some((l) => l.length === 0);
  if (read.rows.length === 0) return true;
  // Total Points is rebuilt from the six categories, so its (stylised, often unreadable) digits don't count.
  return Object.entries(read.values).some(([key, cells]) => key !== "total_points" && cells!.some((v) => v === null));
}

/**
 * Fills what OCR couldn't read from the model's answer. OCR values (which won
 * a vote) are never overwritten; only blanks, missing rows and names are filled.
 */
export function fillFromAi(read: ReadWithRows, ai: AiSquadRead): { read: ReadWithRows; filled: number } {
  let filled = 0;
  const names = [0, 1, 2].map((i) => read.names[i]?.trim() || ai.names[i]?.trim() || null);
  const team = read.team?.trim() || ai.team?.trim() || null;

  if (ai.screen === "awards") {
    if (read.rows.length > 0) return { read, filled };
    const awards: SquadAward[][] = [0, 1, 2].map((i) => {
      const ocr = read.awards?.[i] ?? [];
      if (ocr.length > 0) return ocr;
      const fromAi = ai.awards[i] ?? [];
      filled += fromAi.length;
      return fromAi.map((a) => ({ title: a.title.trim(), tier: a.tier }));
    });
    return { read: { ...read, names, awards }, filled };
  }
  if (ai.screen !== "table" || read.awards) return { read, filled };

  const values: ReadWithRows["values"] = Object.fromEntries(Object.entries(read.values).map(([k, v]) => [k, [...v!]]));
  const rows = [...read.rows];
  for (const aiRow of ai.rows) {
    const row = matchRowLabel(aiRow.label);
    if (!row) continue;
    if (!rows.includes(row.label)) rows.push(row.label);
    const signed = row.group === "rating";
    for (let i = 0; i < 3; i += 1) {
      const text = aiRow.values[i];
      const parsed = text ? parseCell(text, row.format, signed) : null;
      row.keys.forEach((key, k) => {
        const cells = (values[key] ??= [null, null, null]);
        const v = parsed?.[k];
        if (cells[i] === null && v !== undefined && Math.abs(v) <= row.max) {
          cells[i] = v;
          filled += 1;
        }
      });
    }
  }
  return { read: { ...read, names, team, values, rows }, filled };
}
