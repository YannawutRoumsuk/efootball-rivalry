import { handle } from "@/lib/api/server";
import { requireRivalry } from "@/lib/server/context";
import { subscribe } from "@/lib/server/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream of match changes for the caller's rivalry.
 * Membership is verified when the stream opens; events carry IDs only, and
 * clients re-fetch data through the normal RLS-protected pages.
 */
export const GET = handle(async (request: Request) => {
  const { rivalry } = await requireRivalry();
  const encoder = new TextEncoder();
  let cleanup = () => undefined as void;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = await subscribe(rivalry.id, (event) => {
        send(`event: match\ndata: ${JSON.stringify({ matchId: event.match_id, op: event.op })}\n\n`);
      });
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", () => cleanup());
      send("retry: 3000\nevent: ready\ndata: {}\n\n");
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
});
