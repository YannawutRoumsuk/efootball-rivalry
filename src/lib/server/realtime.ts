import "server-only";

import { z } from "zod";
import { sql } from "@/lib/db";

export const RIVALRY_CHANNEL = "rivalry_events";

const eventSchema = z.object({
  rivalry_id: z.uuid(),
  match_id: z.uuid(),
  op: z.enum(["INSERT", "UPDATE", "DELETE"]),
});
export type RivalryEvent = z.infer<typeof eventSchema>;
type Listener = (event: RivalryEvent) => void;

interface Hub {
  listeners: Map<string, Set<Listener>>;
  ready: Promise<void> | null;
}

declare global {
  var __rivalryHub: Hub | undefined;
}

function hub(): Hub {
  globalThis.__rivalryHub ??= { listeners: new Map(), ready: null };
  return globalThis.__rivalryHub;
}

/** Parses a NOTIFY payload from the matches trigger; ignores anything malformed. */
export function parseRivalryEvent(payload: string): RivalryEvent | null {
  try {
    const parsed = eventSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Fans one event out to the listeners of its rivalry only. Exported for tests. */
export function dispatch(listeners: Map<string, Set<Listener>>, payload: string): number {
  const event = parseRivalryEvent(payload);
  if (!event) return 0;
  const set = listeners.get(event.rivalry_id);
  if (!set) return 0;
  for (const fn of set) fn(event);
  return set.size;
}

/** One LISTEN connection per server process (postgres.js reconnects automatically). */
function ensureListening(): Promise<void> {
  const h = hub();
  h.ready ??= sql()
    .listen(RIVALRY_CHANNEL, (payload) => {
      dispatch(h.listeners, payload);
    })
    .then(() => undefined)
    .catch((err) => {
      h.ready = null;
      throw err;
    });
  return h.ready;
}

/** Subscribe to a rivalry's match changes. Caller must already have verified membership. */
export async function subscribe(rivalryId: string, fn: Listener): Promise<() => void> {
  await ensureListening();
  const { listeners } = hub();
  const set = listeners.get(rivalryId) ?? new Set<Listener>();
  set.add(fn);
  listeners.set(rivalryId, set);
  return () => {
    set.delete(fn);
    if (set.size === 0) listeners.delete(rivalryId);
  };
}
