import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { getPlayerPins } from "@/lib/env";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

/**
 * Finds the seat whose PIN matches. Every configured PIN is compared in
 * constant time, so response timing doesn't reveal which seat was close.
 */
export function seatForPin(submitted: string): number | null {
  const candidate = digest(submitted);
  let found: number | null = null;
  for (const { seat, pin } of getPlayerPins().pins) {
    if (timingSafeEqual(candidate, digest(pin)) && found === null) found = seat;
  }
  return found;
}

/**
 * Stored on each session. Binding it to the user AND their current PIN means
 * changing one player's PIN signs only that player out.
 */
export function pinFingerprint(userId: string, pin: string): string {
  return createHash("sha256").update(`rivalry-pin:${userId}:${pin}`, "utf8").digest("hex").slice(0, 32);
}

export function pinForSeat(seat: number | null): string | null {
  if (seat === null) return null;
  return getPlayerPins().pins.find((p) => p.seat === seat)?.pin ?? null;
}
