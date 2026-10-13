import "server-only";

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

/** Railway volume mount in production (STORAGE_DIR=/data/screenshots); ./.data locally. */
function root(): string {
  // Runtime-only location: keep the bundler from tracing the whole project.
  return resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? join(/*turbopackIgnore: true*/ process.cwd(), ".data", "screenshots"));
}

const SAFE_KEY = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/** Resolves a storage key ("<rivalryId>/<uuid>.<ext>") strictly inside the storage root. */
function pathFor(key: string): string {
  if (!SAFE_KEY.test(key)) throw new Error("Invalid storage key");
  const base = root();
  const full = resolve(/*turbopackIgnore: true*/ base, key);
  if (!full.startsWith(base + sep)) throw new Error("Invalid storage key");
  return full;
}

/** Atomic write: temp file + rename, never overwrites an existing object. */
export async function saveScreenshot(key: string, data: Buffer): Promise<void> {
  const full = pathFor(key);
  await mkdir(dirname(full), { recursive: true });
  const tmp = `${full}.${process.pid}.tmp`;
  await writeFile(tmp, data, { flag: "wx" });
  await rename(tmp, full);
}

export async function readScreenshot(key: string): Promise<Buffer> {
  return readFile(pathFor(key));
}

/** Health probe: can we create and remove a file on the volume? */
export async function checkStorageWritable(): Promise<boolean> {
  const probe = join(/*turbopackIgnore: true*/ root(), `.health-${process.pid}`);
  try {
    await mkdir(root(), { recursive: true });
    await writeFile(probe, "ok");
    await rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** Same-origin URL; the route checks rivalry membership on every request. */
export function screenshotUrl(uploadId: string): string {
  return `/api/screenshots/${uploadId}`;
}
