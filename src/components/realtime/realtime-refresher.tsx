"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Listens to the rivalry's Server-Sent Events stream and re-renders server
 * data in place when either player saves or changes a match — no full reload.
 * EventSource reconnects on its own after network drops.
 */
export function RealtimeRefresher() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
    };

    const source = new EventSource("/api/events");
    source.addEventListener("match", refresh);

    // Catch up on anything missed while the phone was locked.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      source.close();
      document.removeEventListener("visibilitychange", onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return null;
}
