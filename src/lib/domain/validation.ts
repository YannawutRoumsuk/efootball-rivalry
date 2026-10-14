import { z } from "zod";
import { STAT_KEYS, type ScreenSide, type StatKey } from "./types";

/** Upper bounds mirror the database CHECK constraints. */
export const STAT_LIMITS: Record<StatKey | "goals", number> = {
  goals: 99,
  possession_pct: 100,
  shots: 200,
  shots_on_target: 200,
  fouls: 200,
  offsides: 200,
  corners: 200,
  free_kicks: 200,
  passes: 3000,
  successful_passes: 3000,
  crosses: 500,
  interceptions: 500,
  tackles: 500,
  saves: 200,
};

/** Values above these are legal but unusual enough to double-check. */
const UNUSUAL: Partial<Record<StatKey | "goals", number>> = {
  goals: 20,
  shots: 60,
  shots_on_target: 40,
  passes: 1500,
  successful_passes: 1500,
  fouls: 30,
};

/** A side as edited in the review form, before it is assigned to a player. */
export type DraftSide = {
  onscreen_label: string | null;
  team_name: string | null;
  goals: number | null;
} & { [K in StatKey]: number | null };

export type IssueCode =
  | "required"
  | "unreadableGoals"
  | "range"
  | "unusual"
  | "sotGtShots"
  | "succGtPasses"
  | "goalsGtSot"
  | "possessionTotal"
  | "unreadable";

export interface ValidationIssue {
  severity: "error" | "warning";
  side: ScreenSide | "match";
  field?: StatKey | "goals";
  /** Translation key suffix (issue.<code>) and its parameters; `message` is the English fallback. */
  code: IssueCode;
  params?: Record<string, string | number>;
  message: string;
}

export function emptyDraftSide(): DraftSide {
  return {
    onscreen_label: null,
    team_name: null,
    goals: null,
    possession_pct: null,
    shots: null,
    shots_on_target: null,
    fouls: null,
    offsides: null,
    corners: null,
    free_kicks: null,
    passes: null,
    successful_passes: null,
    crosses: null,
    interceptions: null,
    tackles: null,
    saves: null,
  };
}

// Note: saves are NOT checked against the opponent's shots on target — eFootball's
// saves counter can legitimately exceed it (seen on real full-time screens).
function validateOneSide(side: ScreenSide, s: DraftSide): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const label = side === "left" ? "Left" : "Right";

  if (s.goals === null) {
    issues.push({ severity: "error", side, field: "goals", code: "required", message: `${label} score is required.` });
  }

  for (const key of ["goals", ...STAT_KEYS] as const) {
    const v = s[key];
    if (v === null) continue;
    const integer = key !== "possession_pct";
    if (!Number.isFinite(v) || v < 0 || v > STAT_LIMITS[key] || (integer && !Number.isInteger(v))) {
      issues.push({
        severity: "error",
        side,
        field: key,
        code: "range",
        params: { max: STAT_LIMITS[key] },
        message: `${label} ${key.replaceAll("_", " ")} must be ${integer ? "a whole number" : "a number"} between 0 and ${STAT_LIMITS[key]}.`,
      });
      continue;
    }
    const unusual = UNUSUAL[key];
    if (unusual !== undefined && v > unusual) {
      issues.push({
        severity: "warning",
        side,
        field: key,
        code: "unusual",
        params: { value: v },
        message: `${label} ${key.replaceAll("_", " ")} (${v}) is unusually high — please double-check.`,
      });
    }
  }

  if (s.shots !== null && s.shots_on_target !== null && s.shots_on_target > s.shots) {
    issues.push({
      severity: "error",
      side,
      field: "shots_on_target",
      code: "sotGtShots",
      params: { sot: s.shots_on_target, shots: s.shots },
      message: `${label}: shots on target (${s.shots_on_target}) cannot exceed total shots (${s.shots}).`,
    });
  }
  if (s.passes !== null && s.successful_passes !== null && s.successful_passes > s.passes) {
    issues.push({
      severity: "error",
      side,
      field: "successful_passes",
      code: "succGtPasses",
      params: { succ: s.successful_passes, passes: s.passes },
      message: `${label}: successful passes (${s.successful_passes}) cannot exceed passes (${s.passes}).`,
    });
  }
  if (s.goals !== null && s.shots_on_target !== null && s.goals > s.shots_on_target) {
    issues.push({
      severity: "warning",
      side,
      field: "goals",
      code: "goalsGtSot",
      message: `${label} scored more goals than shots on target — fine for own goals, otherwise check the numbers.`,
    });
  }
  return issues;
}

/** Cross-field validation shared by the review form, AI extraction and the API. */
export function validateSides(left: DraftSide, right: DraftSide): ValidationIssue[] {
  const issues = [...validateOneSide("left", left), ...validateOneSide("right", right)];
  const pl = left.possession_pct;
  const pr = right.possession_pct;
  if (pl !== null && pr !== null && Math.abs(pl + pr - 100) > 1) {
    issues.push({
      severity: "warning",
      side: "match",
      field: "possession_pct",
      code: "possessionTotal",
      params: { total: pl + pr },
      message: `Possession adds up to ${pl + pr}% instead of 100%.`,
    });
  }
  return issues;
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

// ---------------------------------------------------------------------------
// API input schemas
// ---------------------------------------------------------------------------

const count = (max: number) => z.number().int().min(0).max(max).nullable();
const label = z
  .string()
  .trim()
  .max(60)
  .nullable()
  .transform((v) => (v ? v : null));

export const sideInputSchema = z.object({
  player_id: z.uuid(),
  screen_side: z.enum(["left", "right"]),
  onscreen_label: label,
  team_name: label,
  goals: z.number().int().min(0).max(STAT_LIMITS.goals),
  possession_pct: z.number().min(0).max(100).nullable(),
  shots: count(STAT_LIMITS.shots),
  shots_on_target: count(STAT_LIMITS.shots_on_target),
  fouls: count(STAT_LIMITS.fouls),
  offsides: count(STAT_LIMITS.offsides),
  corners: count(STAT_LIMITS.corners),
  free_kicks: count(STAT_LIMITS.free_kicks),
  passes: count(STAT_LIMITS.passes),
  successful_passes: count(STAT_LIMITS.successful_passes),
  crosses: count(STAT_LIMITS.crosses),
  interceptions: count(STAT_LIMITS.interceptions),
  tackles: count(STAT_LIMITS.tackles),
  saves: count(STAT_LIMITS.saves),
});

export type SideInput = z.infer<typeof sideInputSchema>;

/** Match dates are day-precision ("YYYY-MM-DD"); stored at 12:00 UTC. */
export const playedOnSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T12:00:00Z`)), "Invalid date")
  .nullable();

export function playedOnToTimestamp(day: string | null): string | null {
  return day ? `${day}T12:00:00.000Z` : null;
}

const sidesSchema = z
  .tuple([sideInputSchema, sideInputSchema])
  .superRefine((sides, ctx) => {
    const [x, y] = sides;
    if (x.screen_side === y.screen_side) {
      ctx.addIssue({ code: "custom", message: "One side must be left and the other right." });
    }
    if (x.player_id === y.player_id) {
      ctx.addIssue({ code: "custom", message: "Each side must be a different player." });
    }
    const left = x.screen_side === "left" ? x : y;
    const right = x.screen_side === "left" ? y : x;
    for (const issue of validateSides(left, right)) {
      if (issue.severity === "error") ctx.addIssue({ code: "custom", message: issue.message });
    }
  });

export const createMatchSchema = z.object({
  upload_id: z.uuid().nullable(),
  played_on: playedOnSchema,
  sides: sidesSchema,
  insert_at: z.number().int().min(1).nullable().default(null),
  acknowledge_duplicates: z.boolean().default(false),
});

export const updateMatchSchema = z.object({
  played_on: playedOnSchema,
  sides: sidesSchema,
  note: z.string().trim().max(500).nullable().default(null),
});

export const matchStatusSchema = z.object({
  action: z.enum(["dispute", "resolve", "void", "restore"]),
  note: z.string().trim().max(500).nullable().default(null),
});

export const moveMatchSchema = z.object({ match_no: z.number().int().min(1) });

export const duplicateCheckSchema = z.object({
  upload_id: z.uuid().nullable(),
  sides: z.tuple([sideInputSchema, sideInputSchema]),
  played_on: playedOnSchema,
  exclude_match_id: z.uuid().nullable().default(null),
});
