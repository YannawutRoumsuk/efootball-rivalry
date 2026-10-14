"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";
import { cn } from "@/lib/utils";

const RANGES: Array<{ id: string; label: MessageKey }> = [
  { id: "all", label: "range.all" },
  { id: "last5", label: "range.last5" },
  { id: "last10", label: "range.last10" },
  { id: "last20", label: "range.last20" },
  { id: "dates", label: "range.dates" },
];

export function RangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const t = useT();
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
      <div className="inline-flex flex-wrap rounded-lg border bg-card p-1" role="toolbar" aria-label={t("range.label")}>
        {RANGES.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={current === r.id}
            onClick={() => update(r.id === "dates" ? { range: "dates" } : { range: r.id === "all" ? null : r.id, from: null, to: null })}
            className={cn(
              "h-9 rounded-md px-3 text-sm font-medium transition-colors",
              current === r.id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(r.label)}
          </button>
        ))}
      </div>
      {current === "dates" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Input type="date" aria-label={t("range.fromAria")} className="h-10 w-40" defaultValue={params.get("from") ?? ""} onChange={(e) => update({ from: e.target.value })} />
          <span className="text-muted-foreground">{t("range.to")}</span>
          <Input type="date" aria-label={t("range.toAria")} className="h-10 w-40" defaultValue={params.get("to") ?? ""} onChange={(e) => update({ to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
