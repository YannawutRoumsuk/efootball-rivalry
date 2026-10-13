import { extractMatchStats } from "@/lib/ai/extract";
import { ApiError } from "@/lib/api/envelope";
import { handle, ok } from "@/lib/api/server";
import { jsonb } from "@/lib/db";
import { getAiConfig } from "@/lib/env";
import { asUser, requireRivalry, requireUuid } from "@/lib/server/context";
import { prepareForVision } from "@/lib/server/image";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { readScreenshot } from "@/lib/server/storage";

export const runtime = "nodejs";
export const maxDuration = 90;

const PER_10_MIN = 15;
const PER_DAY = 150;
const LIMIT_MESSAGE = "Too many AI extractions. Please wait a few minutes.";

/**
 * Step 2: runs the vision model on a stored screenshot. The result is only a
 * draft — nothing is saved as a match until the user reviews and confirms it.
 * No transaction is held open while the model is working.
 */
export const POST = handle(async (_request: Request, context: RouteContext<"/api/uploads/[id]/extract">) => {
  const id = requireUuid((await context.params).id);
  const { rivalry, userId } = await requireRivalry({ needPair: true });

  const config = getAiConfig();
  if (!config) {
    throw new ApiError("AI_NOT_CONFIGURED", "AI extraction isn't configured on this server. Enter the result manually instead.", 503);
  }

  const upload = await asUser(userId, async (tx) => {
    const [row] = await tx<Array<{ rivalry_id: string; storage_path: string; match_id: string | null }>>`
      select rivalry_id, storage_path, match_id from public.match_uploads where id = ${id}`;
    if (!row || row.rivalry_id !== rivalry.id) throw new ApiError("NOT_FOUND", "Upload not found.", 404);
    if (row.match_id) throw new ApiError("ALREADY_SAVED", "This screenshot is already saved as a match.", 409);
    await consumeRateLimit(tx, "ai_extract_10m", PER_10_MIN, 600, LIMIT_MESSAGE);
    await consumeRateLimit(tx, "ai_extract_day", PER_DAY, 86_400, LIMIT_MESSAGE);
    await tx`update public.match_uploads set extraction_status = 'processing', extraction_error = null where id = ${id}`;
    return row;
  });

  const setStatus = (status: "succeeded" | "failed", json: unknown, error: string | null) =>
    asUser(userId, (tx) => tx`
      update public.match_uploads
      set extraction_status = ${status}, extraction_json = ${json === null ? null : jsonb(tx, json)}::jsonb, extraction_error = ${error}
      where id = ${id}`);

  try {
    let file: Buffer;
    try {
      file = await readScreenshot(upload.storage_path);
    } catch {
      throw new ApiError("STORAGE_ERROR", "Couldn't read the stored screenshot.", 502);
    }
    const { raw, result } = await extractMatchStats(config, await prepareForVision(file));
    await setStatus("succeeded", { provider: config.provider, model: config.model, raw }, null);
    return ok({ left: result.left, right: result.right, issues: result.issues, provider: config.provider });
  } catch (err) {
    await setStatus("failed", null, err instanceof ApiError ? err.message : "Extraction failed.").catch(() => undefined);
    throw err;
  }
});
