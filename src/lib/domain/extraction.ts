import { z } from "zod";
import { PENALTY_MAX, STAT_LIMITS, emptyDraftSide, validateSides, type DraftSide, type ValidationIssue } from "./validation";
import type { ScreenSide } from "./types";

/** Field names returned by the vision model (matches the public JSON contract). */
export const AI_COUNT_FIELDS = [
  "goals",
  "penalties",
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
] as const;

type AiCountField = (typeof AI_COUNT_FIELDS)[number];

const looseNumber = z.union([z.number(), z.string(), z.null()]).optional();

/** Deliberately loose: the model's output is untrusted and sanitised below. */
export const rawAiSideSchema = z.object({
  onscreen_label: z.union([z.string(), z.null()]).optional(),
  possession: looseNumber,
  ...Object.fromEntries(AI_COUNT_FIELDS.map((f) => [f, looseNumber])),
}) as z.ZodType<RawAiSide>;

export type RawAiSide = {
  onscreen_label?: string | null;
  possession?: number | string | null;
} & { [K in AiCountField]?: number | string | null };

export const rawAiExtractionSchema = z.object({
  left: rawAiSideSchema,
  right: rawAiSideSchema,
});

export interface ExtractionResult {
  left: DraftSide;
  right: DraftSide;
  /** Problems found while sanitising or cross-validating the model output. */
  issues: ValidationIssue[];
}

function toNumber(v: number | string | null | undefined): number | null | "invalid" {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : "invalid";
  const cleaned = v.trim().replace(/%$/, "").trim();
  if (cleaned === "" || /^(null|n\/a|-|—|\?)$/i.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : "invalid";
}

function sanitizeSide(side: ScreenSide, raw: RawAiSide, issues: ValidationIssue[]): DraftSide {
  const out = emptyDraftSide();
  const label = typeof raw.onscreen_label === "string" ? raw.onscreen_label.trim().slice(0, 60) : "";
  // Labels are kept verbatim; they are NOT assumed to be team or player names.
  out.onscreen_label = label || null;

  const put = (field: AiCountField | "possession", value: number | string | null | undefined) => {
    const key = field === "possession" ? "possession_pct" : field;
    const n = toNumber(value);
    const max = key === "penalties" ? PENALTY_MAX : STAT_LIMITS[key];
    const integer = key !== "possession_pct";
    if (n === null) return;
    if (n === "invalid" || n < 0 || n > max || (integer && !Number.isInteger(n))) {
      // Never guess: an unreadable or impossible value becomes "missing".
      issues.push({
        severity: "warning",
        side,
        field: key,
        code: "unreadable",
        params: { value: String(value) },
        message: `${side === "left" ? "Left" : "Right"} ${key.replaceAll("_", " ")} was read as "${String(value)}", which isn't valid. Please enter it manually.`,
      });
      return;
    }
    out[key] = n;
  };

  put("possession", raw.possession);
  for (const f of AI_COUNT_FIELDS) put(f, raw[f]);
  return out;
}

/**
 * Converts raw model output into review-form drafts. Missing values stay null
 * (never zero), invalid values are dropped with a warning, and cross-field
 * rules (e.g. shots on target ≤ shots) are reported for the user to fix.
 */
export function sanitizeExtraction(raw: unknown): ExtractionResult {
  const parsed = rawAiExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("AI response did not match the expected structure");
  }
  const issues: ValidationIssue[] = [];
  const left = sanitizeSide("left", parsed.data.left, issues);
  const right = sanitizeSide("right", parsed.data.right, issues);

  for (const issue of validateSides(left, right)) {
    // A missing score from the model is a warning here; the form makes it an error.
    issues.push(issue.field === "goals" && issue.severity === "error"
      ? { ...issue, severity: "warning", code: "unreadableGoals", message: issue.message.replace("is required", "couldn't be read") }
      : issue);
  }
  return { left, right, issues };
}
