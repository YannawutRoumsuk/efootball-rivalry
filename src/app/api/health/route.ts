import { isDatabaseConfigured, sql } from "@/lib/db";
import { getAiConfig, getPlayerPins } from "@/lib/env";
import { checkStorageWritable } from "@/lib/server/storage";

export const dynamic = "force-dynamic";

/** Liveness probe for Railway. Reports component state, never secrets. */
export async function GET() {
  if (!isDatabaseConfigured()) return Response.json({ ok: true, database: "not_configured" });

  let database: "up" | "down" = "up";
  try {
    const [{ applied }] = await sql()<Array<{ applied: number }>>`
      select count(*)::int as applied from public.schema_migrations`;
    if (applied < 1) database = "down";
  } catch {
    database = "down";
  }
  const storage = (await checkStorageWritable()) ? "writable" : "unavailable";
  const ok = database === "up" && storage === "writable";
  const ai = getAiConfig()?.provider ?? "off";
  const pins = getPlayerPins();
  const login = pins.error ? `not_configured: ${pins.error}` : `pin (${pins.pins.length} players)`;
  return Response.json({ ok, database, storage, ai, login }, { status: ok ? 200 : 503 });
}
