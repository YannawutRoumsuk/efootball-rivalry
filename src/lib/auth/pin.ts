import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { getAppPin } from "@/lib/env";

/** Constant-time comparison of a submitted PIN with APP_PIN. */
export function pinMatches(submitted: string): boolean {
  const expected = getAppPin();
  if (!expected) return false;
  const a = createHash("sha256").update(submitted, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

/**
 * Fingerprint of the current APP_PIN stored on each session. When the PIN
 * changes, the fingerprint no longer matches and old sessions stop working.
 */
export function currentPinFingerprint(): string | null {
  const pin = getAppPin();
  return pin ? createHash("sha256").update(`rivalry-pin:${pin}`, "utf8").digest("hex").slice(0, 32) : null;
}
