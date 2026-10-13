import { Sparkles } from "lucide-react";
import type { Insight } from "@/lib/domain/insights";
import { cn } from "@/lib/utils";

export function InsightsList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <section aria-labelledby="insights-heading" className="panel p-4 sm:p-6">
      <h2 id="insights-heading" className="eyebrow mb-3 flex items-center gap-2">
        <Sparkles className="size-3.5 text-gold" aria-hidden /> Match insights
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
            {i.text}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[0.7rem] text-muted-foreground">Calculated from confirmed matches — not AI-generated.</p>
    </section>
  );
}
