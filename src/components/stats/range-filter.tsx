"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const RANGES = [
  { id: "all", label: "All time" },
  { id: "last5", label: "Last 5" },
  { id: "last10", label: "Last 10" },
  { id: "last20", label: "Last 20" },
  { id: "dates", label: "Dates" },
];

export function RangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const current = params.get("range") ?? "all";

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className={cn("space-y-3 transition-opacity", pending && "opacity-60")}>
      <div className="inline-flex flex-wrap rounded-xl border bg-card p-1" role="toolbar" aria-label="Range">
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={current === r.id}
            onClick={() => update(r.id === "dates" ? { range: "dates" } : { range: r.id === "all" ? null : r.id, from: null, to: null })}
            className={cn(
              "h-9 rounded-lg px-3 text-sm font-medium transition-colors",
              current === r.id ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      {current === "dates" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Input type="date" aria-label="From date" className="h-10 w-40" defaultValue={params.get("from") ?? ""} onChange={(e) => update({ from: e.target.value })} />
          <span className="text-muted-foreground">to</span>
          <Input type="date" aria-label="To date" className="h-10 w-40" defaultValue={params.get("to") ?? ""} onChange={(e) => update({ to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
