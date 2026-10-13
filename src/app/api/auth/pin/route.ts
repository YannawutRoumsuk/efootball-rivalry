import { z } from "zod";
import { ApiError } from "@/lib/api/envelope";
import { clientIp, handle, ok, parseJson } from "@/lib/api/server";
import { pinFingerprint, seatForPin } from "@/lib/auth/pin";
import { ensureSeats } from "@/lib/auth/players";
import { allowAttempt, startSession } from "@/lib/auth/session";
import { getPlayerPins } from "@/lib/env";

export const runtime = "nodejs";

const schema = z.object({ pin: z.string().trim().regex(/^\d{1,12}$/, "Enter your numeric code.") });

/** Each player has their own PIN (PLAYER_<n>_PIN); entering it signs in as that player. */
export const POST = handle(async (request: Request) => {
  const config = getPlayerPins();
  if (config.error) throw new ApiError("PIN_NOT_CONFIGURED", `Login isn't configured: ${config.error}.`, 503);
  const { pin } = await parseJson(request, schema);

  const allowed = await allowAttempt([`pin-ip:${clientIp(request)}`], 10, 900);
  if (!allowed || !(await allowAttempt(["pin-global"], 60, 3600))) {
    throw new ApiError("RATE_LIMITED", "Too many attempts. Wait a few minutes and try again.", 429);
  }

  const seatNo = seatForPin(pin);
  if (seatNo === null) throw new ApiError("WRONG_PIN", "Wrong code.", 401);

  const seat = (await ensureSeats()).find((s) => s.seat === seatNo);
  if (!seat) throw new ApiError("NO_SEAT", "Player not found.", 404);
  await startSession(seat.id, pinFingerprint(seat.id, pin));
  return ok({ seat: seat.seat, name: seat.name });
});
