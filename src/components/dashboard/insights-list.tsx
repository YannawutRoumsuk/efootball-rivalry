"use client";

import type { Insight } from "@/lib/domain/insights";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function InsightsList({ insights }: { insights: Insight[] }) {
  const t = useT();
  if (insights.length === 0) return null;
  return (
    <section aria-labelledby="insights-heading" className="panel p-4 sm:p-6">
      <h2 id="insights-heading" className="mb-3 text-sm font-semibold">
        {t("insights.title")}
      </h2>
      <ul className="space-y-2.5">
        {insights.map((i) => (
          <li key={i.id} className="flex gap-3 text-sm leading-relaxed">
            <span
              className={cn(
                "mt-2 size-1.5 shrink-0 rounded-full",
                i.tone === "a" ? "bg-player-a" : i.tone === "b" ? "bg-player-b" : "bg-draw",
              )}
              aria-hidden
            />
            {t(i.key, i.params)}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">{t("insights.note")}</p>
    </section>
  );
}
