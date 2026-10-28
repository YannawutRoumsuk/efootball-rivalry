import { CalendarDays, Upload } from "lucide-react";
import Link from "next/link";
import { pairStyle } from "@/components/player/seat-scope";
import { pairFor, type Roster } from "@/lib/domain/league";
import { hasShootout, toPerspective } from "@/lib/domain/match";
import type { Match, PlayerKey, PlayerPair } from "@/lib/domain/types";
import { formatMatchDate } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

function SideLine({ pair, k, goals, label, team, won, align }: {
  pair: PlayerPair;
  k: PlayerKey;
  goals: number;
  label: string | null;
  team: string | null;
  won: boolean;
  align: "left" | "right";
}) {
  const sub = [team, label && label !== team ? `“${label}”` : null].filter(Boolean).join(" · ");
  return (
    <div className={cn("flex min-w-0 items-center gap-3", align === "right" && "flex-row-reverse text-right")}>
      <span
        className={cn(
          "text-3xl leading-none font-semibold tabular",
          won ? (k === "a" ? "text-player-a" : "text-player-b") : "text-muted-foreground",
        )}
      >
        {goals}
      </span>
      <div className="min-w-0">
        <p className={cn("truncate text-sm font-semibold", k === "a" ? "text-player-a" : "text-player-b", !won && "opacity-80")}>
          {pair[k].display_name}
        </p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

/** One match, players in seat order and in their own colours. */
export async function MatchCard({ match, roster }: { match: Match; roster: Roster }) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const pair = pairFor(roster, match.sides[0].player_id, match.sides[1].player_id);
  const pm = toPerspective(match, pair);
  const uploader = roster.find((p) => p.id === match.created_by)?.display_name ?? "—";
  const date = formatMatchDate(match.played_at, locale);

  return (
    <Link
      href={`/matches/${match.id}`}
      style={pairStyle(pair.seats[0], pair.seats[1])}
      className={cn(
        "panel group block p-4 transition-colors hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        match.status === "void" && "opacity-55",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("card.match", { n: match.match_no })}</span>
        <div className="flex items-center gap-2">
          {pm.winner === "draw" && <span className="text-xs font-medium text-draw">{t("card.draw")}</span>}
          {hasShootout(pm.a, pm.b) && (
            <span className="text-xs font-medium text-muted-foreground tabular">{t("pk.short", { l: pm.a.penalties!, r: pm.b.penalties! })}</span>
          )}
          <StatusBadge status={match.status} label={t(`status.${match.status}`)} />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <SideLine pair={pair} k="a" goals={pm.a.goals} label={pm.a.onscreen_label} team={pm.a.team_name} won={pm.winner === "a"} align="left" />
        <span className="text-xs text-muted-foreground">{t("common.vs")}</span>
        <SideLine pair={pair} k="b" goals={pm.b.goals} label={pm.b.onscreen_label} team={pm.b.team_name} won={pm.winner === "b"} align="right" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5" aria-hidden /> {date ?? t("common.dateUnknown")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Upload className="size-3.5" aria-hidden /> {uploader}
        </span>
        <span className="ml-auto">
          {t("card.played", { name: pair.a.display_name, side: t(pm.a.screen_side === "left" ? "common.left" : "common.right") })}
        </span>
      </div>
    </Link>
  );
}
