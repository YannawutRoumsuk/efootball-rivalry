import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/envelope";
import { handle, ok } from "@/lib/api/server";
import { jsonb } from "@/lib/db";
import type { SquadScreenRead } from "@/lib/domain/squad";
import { readSquadScreen, type SquadOcrResult } from "@/lib/ocr/squad";
import { asUser, requireRivalry } from "@/lib/server/context";
import { inspectUpload, MAX_UPLOAD_BYTES } from "@/lib/server/image";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { saveScreenshot } from "@/lib/server/storage";

export const runtime = "nodejs";
export const maxDuration = 90;

const OCR_LIMIT_MESSAGE = "Too many screenshots read. Please wait a few minutes.";

export interface SquadUploadResponse {
  uploadId: string;
  imageUrl: string;
  read: SquadScreenRead & { rows: string[]; problems: string[] };
  /** A saved 3v3 match that already used this exact image. */
  duplicateOf: string | null;
}

/**
 * Stores one screenshot of the 3v3 stats table and reads it with local OCR.
 * Nothing is saved as a match until the reviewed draft is posted.
 */
export const POST = handle(async (request: Request) => {
  const { rivalry, userId } = await requireRivalry({ needPlayers: true });

  const length = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(length) || length <= 0) throw new ApiError("LENGTH_REQUIRED", "Upload size is missing.", 411);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) throw new ApiError("FILE_TOO_LARGE", "Screenshots must be 10 MB or smaller.", 413);

  let file: File | null = null;
  try {
    const entry = (await request.formData()).get("file");
    file = entry instanceof File ? entry : null;
  } catch {
    throw new ApiError("BAD_FORM", "Upload must be multipart form data.", 400);
  }
  if (!file) throw new ApiError("NO_FILE", "Choose a screenshot to upload.", 400);

  const buf = Buffer.from(await file.arrayBuffer());
  const info = await inspectUpload(buf);
  const storagePath = `${rivalry.id}/${randomUUID()}.${info.ext}`;

  const stored = await asUser(
    userId,
    async (tx) => {
      await consumeRateLimit(tx, "upload", 60, 3600, "Too many uploads. Please wait a while.");
      await consumeRateLimit(tx, "ocr_extract_10m", 60, 600, OCR_LIMIT_MESSAGE);
      await consumeRateLimit(tx, "ocr_extract_day", 400, 86_400, OCR_LIMIT_MESSAGE);
      const [upload] = await tx<Array<{ id: string }>>`
        insert into public.squad_uploads (rivalry_id, uploaded_by, storage_path, image_hash, mime_type, size_bytes)
        values (${rivalry.id}, ${userId}, ${storagePath}, ${info.sha256}, ${info.mime}, ${buf.length})
        returning id`;
      // Written inside the transaction: if the file can't be stored, the row rolls back.
      await saveScreenshot(storagePath, buf);
      const [dup] = await tx<Array<{ squad_match_id: string }>>`
        select squad_match_id from public.squad_uploads
        where rivalry_id = ${rivalry.id} and image_hash = ${info.sha256} and squad_match_id is not null
        limit 1`;
      return { uploadId: upload.id, duplicateOf: dup?.squad_match_id ?? null };
    },
    "Couldn't store the screenshot.",
  );

  let read: SquadOcrResult;
  try {
    read = await readSquadScreen(buf);
  } catch (err) {
    console.error("[squad] OCR failed", err);
    read = { names: [null, null, null], team: null, values: {}, rows: [], problems: ["OCR failed"], ms: 0 };
  }
  await asUser(userId, (tx) => tx`
    update public.squad_uploads set extraction_json = ${jsonb(tx, read)}::jsonb where id = ${stored.uploadId}`).catch((err: unknown) =>
    console.error("[squad] couldn't store the read", err),
  );

  const body: SquadUploadResponse = {
    uploadId: stored.uploadId,
    imageUrl: `/api/squad/screenshots/${stored.uploadId}`,
    read: { names: read.names, team: read.team, values: read.values, rows: read.rows, problems: read.problems },
    duplicateOf: stored.duplicateOf,
  };
  return ok(body, 201);
});
