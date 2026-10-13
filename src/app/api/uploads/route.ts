import { randomUUID } from "node:crypto";
import { ApiError } from "@/lib/api/envelope";
import { handle, ok } from "@/lib/api/server";
import { asUser, loadMatches, requireRivalry } from "@/lib/server/context";
import { imageDuplicateCandidates, loadUploadFingerprints } from "@/lib/server/duplicates";
import { inspectUpload, MAX_UPLOAD_BYTES } from "@/lib/server/image";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { saveScreenshot, screenshotUrl } from "@/lib/server/storage";

export const runtime = "nodejs";

/**
 * Step 1 of the upload flow: validates the image, stores it on the private
 * volume, records hashes and warns about screenshots that were already used.
 */
export const POST = handle(async (request: Request) => {
  const { rivalry, userId } = await requireRivalry({ needPlayers: true });

  // Require a declared length so oversized bodies are rejected before buffering.
  const length = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(length) || length <= 0) {
    throw new ApiError("LENGTH_REQUIRED", "Upload size is missing.", 411);
  }
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    throw new ApiError("FILE_TOO_LARGE", "Screenshots must be 10 MB or smaller.", 413);
  }

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

  const result = await asUser(
    userId,
    async (tx) => {
      await consumeRateLimit(tx, "upload", 60, 3600, "Too many uploads. Please wait a while.");
      const [upload] = await tx<Array<{ id: string }>>`
        insert into public.match_uploads
          (rivalry_id, uploaded_by, storage_path, image_hash, perceptual_hash, mime_type, size_bytes, extraction_status)
        values
          (${rivalry.id}, ${userId}, ${storagePath}, ${info.sha256}, ${info.perceptualHash}, ${info.mime}, ${buf.length}, 'pending')
        returning id`;
      // Written inside the transaction: if the file can't be stored, the row rolls back.
      await saveScreenshot(storagePath, buf);
      const [matches, uploads] = await Promise.all([loadMatches(tx, rivalry.id), loadUploadFingerprints(tx, rivalry.id)]);
      return { uploadId: upload.id, matches, uploads };
    },
    "Couldn't store the screenshot.",
  );

  const duplicates = imageDuplicateCandidates(
    { imageHash: info.sha256, perceptualHash: info.perceptualHash },
    result.uploads,
    result.matches.filter((m) => m.status !== "void"),
  );

  return ok(
    {
      uploadId: result.uploadId,
      imageUrl: screenshotUrl(result.uploadId),
      width: info.width,
      height: info.height,
      duplicates,
    },
    201,
  );
});
