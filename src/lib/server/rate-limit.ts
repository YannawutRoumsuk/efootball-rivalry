import "server-only";

import { ApiError } from "@/lib/api/envelope";
import type { Tx } from "@/lib/db";

/** Per-user sliding-window limit backed by the consume_rate_limit() RPC. */
export async function consumeRateLimit(
  tx: Tx,
  action: string,
  max: number,
  windowSeconds: number,
  message: string,
): Promise<void> {
  const [{ allowed }] = await tx<Array<{ allowed: boolean }>>`
    select public.consume_rate_limit(${action}::text, ${max}::int, ${windowSeconds}::int) as allowed`;
  if (!allowed) throw new ApiError("RATE_LIMITED", message, 429);
}
