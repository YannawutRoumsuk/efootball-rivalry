import Link from "next/link";
import { seatColor } from "@/components/player/seat-scope";
import type { PairRecord } from "@/lib/domain/league";
import { cn } from "@/lib/utils";

/** One card per pair; also acts as the selector for the head-to-head section below. */
export function PairRecords({
  records,
  selected,
  basePath,
}: {
  records: PairRecord[];
  selected: string;
  basePath: string;
}) {
  return (
    <nav aria-label="Head-to-head pairs" className="grid gap-3 sm:grid-cols-3">
      {records.map((r) => {
        const key = `${r.a.seat}-${r.b.seat}`;
        const active = key === selected;
        const total = Math.max(1, r.played);
        return (
          <Link
            key={key}
            href={`${basePath}?pair=${key}`}
            scroll={false}
            aria-current={active ? "true" : undefined}
            className={cn(
              "panel block px-4 py-3 transition-all sm:p-4 hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active && "border-foreground/40 ring-1 ring-foreground/20",
            )}
          >
            <div className="flex items-center justify-between gap-2 text-sm font-semibold">
              <span className="truncate" style={{ color: seatColor(r.a.seat) }}>{r.a.display_name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">vs</span>
              <span className="truncate text-right" style={{ color: seatColor(r.b.seat) }}>{r.b.display_name}</span>
            </div>
            <p className="mt-0.5 text-center font-display text-xl font-bold tabular sm:mt-1 sm:text-2xl">
              <span style={{ color: seatColor(r.a.seat) }}>{r.winsA}</span>
              <span className="mx-2 text-base text-draw">{r.draws}</span>
              <span style={{ color: seatColor(r.b.seat) }}>{r.winsB}</span>
            </p>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              {r.played > 0 && (
                <>
                  <div style={{ width: `${(r.winsA / total) * 100}%`, background: seatColor(r.a.seat) }} />
                  <div className="bg-draw/60" style={{ width: `${(r.draws / total) * 100}%` }} />
                  <div style={{ width: `${(r.winsB / total) * 100}%`, background: seatColor(r.b.seat) }} />
                </>
              )}
            </div>
            <p className="mt-1.5 text-center text-xs text-muted-foreground sm:mt-2">
              {r.played} {r.played === 1 ? "match" : "matches"} {active ? "· showing below" : "· tap to view"}
            </p>
          </Link>
        );
      })}
    </nav>
  );
}
