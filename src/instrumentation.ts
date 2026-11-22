/** Runs once per server start. Node-only background jobs live behind the runtime check. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { schedulePurge } = await import("@/lib/server/purge");
    schedulePurge();
  }
}
