import "server-only";

import { isDatabaseConfigured, sql } from "@/lib/db";
import { deleteScreenshot } from "./storage";

/** Uploads not saved as a match within this long are deleted (row and file). */
const MAX_AGE_HOURS = Number(process.env.UPLOAD_PURGE_HOURS) || 48;
const EVERY_MS = 6 * 60 * 60_000;
const FIRST_RUN_MS = 2 * 60_000;

declare global {
  var __rivalryPurge: NodeJS.Timeout | undefined;
}

/**
 * Deletes screenshots (1v1 and 3v3) that were uploaded but never attached to
 * a saved match. Runs on the owner connection: it is maintenance, not a user
 * action. Returns how many were removed.
 */
export async function purgeStaleUploads(hours = MAX_AGE_HOURS): Promise<number> {
  const rows = await sql()<Array<{ storage_path: string }>>`select storage_path from public.purge_stale_uploads(${hours}::int)`;
  for (const { storage_path } of rows) {
    await deleteScreenshot(storage_path).catch((err: unknown) => console.error("[purge] file not removed", storage_path, err));
  }
  if (rows.length > 0) console.info(`[purge] removed ${rows.length} unsaved screenshot(s) older than ${hours} h`);
  return rows.length;
}

/** Starts the background purge (shortly after boot, then every 6 hours). Safe to call more than once. */
export function schedulePurge(): void {
  if (globalThis.__rivalryPurge || !isDatabaseConfigured()) return;
  const run = () => void purgeStaleUploads().catch((err: unknown) => console.error("[purge] failed", err));
  globalThis.__rivalryPurge = setTimeout(function tick() {
    run();
    globalThis.__rivalryPurge = setTimeout(tick, EVERY_MS);
    globalThis.__rivalryPurge.unref?.();
  }, FIRST_RUN_MS);
  globalThis.__rivalryPurge.unref?.();
}
