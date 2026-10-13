"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { seatColor } from "@/components/player/seat-scope";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HistoryFilter } from "@/lib/domain/history";
import { cn } from "@/lib/utils";

interface HistoryFiltersProps {
  players: Array<{ seat: number; name: string }>;
}

const OPTIONS: Array<{ id: HistoryFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "last5", label: "Last 5" },
  { id: "last10", label: "Last 10" },
  { id: "draws", label: "Draws" },
  { id: "high_scoring", label: "Highest scoring" },
];

const chip = "h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors";

/** Filters live in the URL so they survive refresh and can be shared. */
export function HistoryFilters({ players }: HistoryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const current = (params.get("filter") ?? "all") as HistoryFilter;
  const player = params.get("player");
  const winsOnly = params.get("wins") === "1";

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className={cn("space-y-3 transition-opacity", pending && "opacity-60")}>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="toolbar" aria-label="Filter matches">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={current === o.id}
            onClick={() => update({ filter: o.id === "all" ? null : o.id })}
            className={cn(chip, current === o.id ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="toolbar" aria-label="Filter by player">
        <button
          type="button"
          aria-pressed={!player}
          onClick={() => update({ player: null, wins: null })}
          className={cn(chip, !player ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
        >
          Everyone
        </button>
        {players.map((p) => {
          const active = player === String(p.seat);
          return (
            <button
              key={p.seat}
              type="button"
              aria-pressed={active}
              onClick={() => update({ player: active ? null : String(p.seat), wins: active ? null : params.get("wins") })}
              style={{ borderColor: active ? seatColor(p.seat) : undefined, color: seatColor(p.seat), background: active ? `color-mix(in oklch, ${seatColor(p.seat)} 15%, transparent)` : undefined }}
              className={cn(chip, !active && "opacity-80 hover:opacity-100")}
            >
              {p.name}
            </button>
          );
        })}
        {player && (
          <label className="flex h-9 shrink-0 items-center gap-2 pl-1 text-sm text-muted-foreground">
            <input type="checkbox" className="size-4" checked={winsOnly} onChange={(e) => update({ wins: e.target.checked ? "1" : null })} />
            Wins only
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="from" className="text-xs text-muted-foreground">From</Label>
          <Input id="from" type="date" className="h-10 w-40" defaultValue={params.get("from") ?? ""} onChange={(e) => update({ from: e.target.value || null })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to" className="text-xs text-muted-foreground">To</Label>
          <Input id="to" type="date" className="h-10 w-40" defaultValue={params.get("to") ?? ""} onChange={(e) => update({ to: e.target.value || null })} />
        </div>
        <label className="flex h-10 items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4" checked={params.get("void") === "1"} onChange={(e) => update({ void: e.target.checked ? "1" : null })} />
          Show voided
        </label>
      </div>
    </div>
  );
}
