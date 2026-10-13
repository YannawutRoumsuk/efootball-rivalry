import { z } from "zod";
import { ApiError } from "@/lib/api/envelope";
import { clientIp, handle, ok, parseJson } from "@/lib/api/server";
import { pinMatches } from "@/lib/auth/pin";
import { ensureSeats } from "@/lib/auth/players";
import { allowAttempt, startSession } from "@/lib/auth/session";
import { getAppPin } from "@/lib/env";

export const runtime = "nodejs";

const schema = z.object({
  pin: z.string().trim().regex(/^\d{1,12}$/, "Enter the numeric code."),
  player: z.enum(["a", "b"]).optional(),
});

/**
 * Step 1 (no `player`): check the PIN and return the two seats to choose from.
 * Step 2 (with `player`): check the PIN again and start a session as that seat.
 */
export const POST = handle(async (request: Request) => {
  if (!getAppPin()) {
    throw new ApiError("PIN_NOT_CONFIGURED", "APP_PIN isn't set on the server yet.", 503);
  }
  const { pin, player } = await parseJson(request, schema);

  // Per-device and global caps make guessing a 6-digit code impractical.
  const allowed = await allowAttempt([`pin-ip:${clientIp(request)}`], 10, 900);
  const globalAllowed = allowed && (await allowAttempt(["pin-global"], 60, 3600));
  if (!allowed || !globalAllowed) {
    throw new ApiError("RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.", 429);
  }
  if (!pinMatches(pin)) throw new ApiError("WRONG_PIN", "Wrong code.", 401);

  const seats = await ensureSeats();
  if (!player) {
    return ok({ players: seats.map(({ key, name }) => ({ key, name })) });
  }
  const seat = seats.find((s) => s.key === player);
  if (!seat) throw new ApiError("NO_SEAT", "Player not found.", 404);
  await startSession(seat.id);
  return ok({ player: seat.key });
});
