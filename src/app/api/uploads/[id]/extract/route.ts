import { extractMatchStats } from "@/lib/ai/extract";
import { ApiError } from "@/lib/api/envelope";
import { handle, ok } from "@/lib/api/server";
import { jsonb } from "@/lib/db";
import type { DraftSide, ValidationIssue } from "@/lib/domain/validation";
import { validateSides } from "@/lib/domain/validation";
import { getAiConfig } from "@/lib/env";
import { readFullTimeScreen, type LabelCandidate, type OcrRead } from "@/lib/ocr/fulltime";
import { matchKnownLabel, suggestPlayers, trustedLatinLabel, type KnownLabel, type PlayerSuggestion } from "@/lib/ocr/labels";
import { asUser, requireRivalry, requireUuid } from "@/lib/server/context";
import { prepareForVision } from "@/lib/server/image";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { readScreenshot } from "@/lib/server/storage";

export const runtime = "nodejs";
export const maxDuration = 90;

// OCR is free but CPU-heavy; the limit leaves room for a 30-screenshot batch import.
const OCR_PER_10_MIN = 60;
const OCR_PER_DAY = 400;
const AI_PER_10_MIN = 15;
const AI_PER_DAY = 150;
const OCR_LIMIT_MESSAGE = "Too many screenshots read. Please wait a few minutes.";
const AI_LIMIT_MESSAGE = "Too many AI extractions. Please wait a few minutes.";

type ExtractSource = "ocr" | "ai" | "ocr-partial";

/** Goals the reader couldn't see are warnings here; the review form turns them into required fields. */
function draftIssues(left: DraftSide, right: DraftSide): ValidationIssue[] {
  return validateSides(left, right).map((i) => (i.field === "goals" && i.severity === "error" ? { ...i, severity: "warning" as const } : i));
}

function chooseLabel(candidates: LabelCandidate[], known: KnownLabel[]) {
  const match = matchKnownLabel(candidates.map((c) => c.text), known);
  if (match) return { label: match.label, match };
  const latin = candidates.find((c) => c.lang === "eng");
  return { label: latin ? trustedLatinLabel(latin.text, latin.confidence) : null, match: null };
}

/**
 * Step 2: reads the stored screenshot. Local OCR first (free, ~1–2 s); the
 * vision model is only called when OCR can't read every number cleanly.
 * The result is a draft — nothing is saved until the user confirms it.
 */
export const POST = handle(async (_request: Request, context: RouteContext<"/api/uploads/[id]/extract">) => {
  const id = requireUuid((await context.params).id);
  const { rivalry, roster, userId } = await requireRivalry({ needPlayers: true });

  const { upload, known } = await asUser(userId, async (tx) => {
    const [row] = await tx<Array<{ rivalry_id: string; storage_path: string; match_id: string | null }>>`
      select rivalry_id, storage_path, match_id from public.match_uploads where id = ${id}`;
    if (!row || row.rivalry_id !== rivalry.id) throw new ApiError("NOT_FOUND", "Upload not found.", 404);
    if (row.match_id) throw new ApiError("ALREADY_SAVED", "This screenshot is already saved as a match.", 409);
    await consumeRateLimit(tx, "ocr_extract_10m", OCR_PER_10_MIN, 600, OCR_LIMIT_MESSAGE);
    await consumeRateLimit(tx, "ocr_extract_day", OCR_PER_DAY, 86_400, OCR_LIMIT_MESSAGE);
    await tx`update public.match_uploads set extraction_status = 'processing', extraction_error = null where id = ${id}`;
    const labels = await tx<KnownLabel[]>`
      select s.player_id as "playerId", s.onscreen_label as label, count(*)::int as uses
      from public.match_sides s join public.matches m on m.id = s.match_id
      where m.rivalry_id = ${rivalry.id} and m.status <> 'void' and s.onscreen_label is not null
      group by s.player_id, s.onscreen_label`;
    return { upload: row, known: labels };
  });

  const setStatus = (status: "succeeded" | "failed", json: unknown, error: string | null) =>
    asUser(userId, (tx) => tx`
      update public.match_uploads
      set extraction_status = ${status}, extraction_json = ${json === null ? null : jsonb(tx, json)}::jsonb, extraction_error = ${error}
      where id = ${id}`);

  // From here on the row says 'processing': every exit must mark it succeeded or failed.
  try {
    return await extract({ storagePath: upload.storage_path, known, rosterIds: roster.map((p) => p.id), userId, setStatus });
  } catch (err) {
    await setStatus("failed", null, err instanceof ApiError ? err.message : "Extraction failed.").catch(() => undefined);
    throw err;
  }
});

interface ExtractArgs {
  storagePath: string;
  known: KnownLabel[];
  rosterIds: string[];
  userId: string;
  setStatus: (status: "succeeded" | "failed", json: unknown, error: string | null) => Promise<unknown>;
}

async function extract({ storagePath, known, rosterIds, userId, setStatus }: ExtractArgs) {
  let file: Buffer;
  try {
    file = await readScreenshot(storagePath);
  } catch {
    throw new ApiError("STORAGE_ERROR", "Couldn't read the stored screenshot.", 502);
  }

  const respond = async (source: ExtractSource, left: DraftSide, right: DraftSide, suggested: PlayerSuggestion, raw: unknown) => {
    await setStatus("succeeded", { source, raw }, null);
    return ok({ left, right, issues: draftIssues(left, right), source, suggested });
  };

  // 1) Local OCR — the screen layout never changes, so this usually reads everything.
  let ocr: OcrRead | null = null;
  try {
    ocr = await readFullTimeScreen(file);
  } catch (err) {
    console.error("[extract] OCR failed", err);
  }
  let partial: (() => Promise<Response>) | null = null;
  if (ocr) {
    const read = ocr;
    const l = chooseLabel(read.labelCandidates.left, known);
    const r = chooseLabel(read.labelCandidates.right, known);
    read.left.onscreen_label = l.label;
    read.right.onscreen_label = r.label;
    const suggested = suggestPlayers(l.match, r.match, rosterIds);
    if (read.complete) {
      return respond("ocr", read.left, read.right, suggested, { ms: read.ms, labels: read.labelCandidates });
    }
    partial = () => respond("ocr-partial", read.left, read.right, suggested, { problems: read.problems });
  }

  // 2) Vision model fallback for unusual or damaged screenshots.
  const config = getAiConfig();
  if (!config) {
    if (partial) return partial();
    throw new ApiError("AI_NOT_CONFIGURED", "Couldn't read this screenshot automatically. Enter the result manually instead.", 503);
  }
  try {
    await asUser(userId, async (tx) => {
      await consumeRateLimit(tx, "ai_extract_10m", AI_PER_10_MIN, 600, AI_LIMIT_MESSAGE);
      await consumeRateLimit(tx, "ai_extract_day", AI_PER_DAY, 86_400, AI_LIMIT_MESSAGE);
    });
  } catch (err) {
    // Out of AI budget: what OCR did read is still better than an empty form.
    if (partial && err instanceof ApiError && err.code === "RATE_LIMITED") return partial();
    throw err;
  }
  const { raw, result } = await extractMatchStats(config, await prepareForVision(file));
  const lm = result.left.onscreen_label ? matchKnownLabel([result.left.onscreen_label], known) : null;
  const rm = result.right.onscreen_label ? matchKnownLabel([result.right.onscreen_label], known) : null;
  return respond("ai", result.left, result.right, suggestPlayers(lm, rm, rosterIds), {
    provider: config.provider,
    model: config.model,
    ocrProblems: ocr?.problems ?? null,
    raw,
  });
}
