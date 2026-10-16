import { HelpCircle } from "lucide-react";
import Link from "next/link";
import { seatColor } from "@/components/player/seat-scope";
import type { EloMatchChange } from "@/lib/domain/elo";
import type { RosterPlayer } from "@/lib/domain/league";
import { signed } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

interface EloChangeProps {
  change: EloMatchChange | null;
  /** The two players, left side of the screen first. */
  players: [RosterPlayer, RosterPlayer];
  seasonName: string;
}

/** How this match moved each player's Elo, with the inputs that produced it. */
export async function EloChange({ change, players, seasonName }: EloChangeProps) {
  const t = await getT();
  return (
    <section aria-labelledby="elo-heading" className="panel p-4 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="elo-heading" className="text-sm font-semibold">
          {t("elo.match.title")} <span className="font-normal text-muted-foreground">· {seasonName}</span>
        </h2>
        <Link href="/guide/elo" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          <HelpCircle className="size-3.5" aria-hidden /> {t("elo.how")}
        </Link>
      </div>
      {change ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {players.map((p) => {
            // Round the ratings, then derive the change, so before + change = after on screen.
            const before = Math.round(change.before[p.id]);
            const after = Math.round(change.before[p.id] + change.delta[p.id]);
            const delta = after - before;
            return (
              <li key={p.id} className="rounded-lg border bg-surface-2 px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold" style={{ color: seatColor(p.seat) }}>
                    {p.display_name}
                  </span>
                  <span className={cn("text-lg font-semibold tabular", delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground")}>
                    {signed(delta)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground tabular">
                  {before} → {after}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("elo.match.expected", { x: Math.round(change.expected[p.id] * 100) })} ·{" "}
                  {t("elo.match.perf", { x: Math.round(change.performance[p.id] * 100) })}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("elo.match.none")}</p>
      )}
    </section>
  );
}
