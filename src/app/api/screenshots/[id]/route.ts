import { ApiError } from "@/lib/api/envelope";
import { handle } from "@/lib/api/server";
import { asUser, requireRivalry, requireUuid } from "@/lib/server/context";
import { readScreenshot } from "@/lib/server/storage";

export const runtime = "nodejs";

/** Streams a private screenshot. RLS on match_uploads limits it to rivalry members. */
export const GET = handle(async (_request: Request, context: RouteContext<"/api/screenshots/[id]">) => {
  const id = requireUuid((await context.params).id);
  const { userId } = await requireRivalry();
  const [upload] = await asUser(userId, (tx) =>
    tx<Array<{ storage_path: string; mime_type: string }>>`
      select storage_path, mime_type from public.match_uploads where id = ${id}`,
  );
  if (!upload) throw new ApiError("NOT_FOUND", "Screenshot not found.", 404);

  let data: Buffer;
  try {
    data = await readScreenshot(upload.storage_path);
  } catch {
    throw new ApiError("NOT_FOUND", "Screenshot file is missing.", 404);
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": upload.mime_type,
      "content-length": String(data.length),
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
});
