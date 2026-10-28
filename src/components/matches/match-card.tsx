import { CalendarDays, Upload } from "lucide-react";
import Link from "next/link";
import { pairStyle } from "@/components/player/seat-scope";
import type { EloMatchChange } from "@/lib/domain/elo";
import { pairFor, type Roster } from "@/lib/domain/league";
import { hasShootout, sideOnScreen, toPerspective } from "@/lib/domain/match";
import { displayedDelta } from "@/lib/domain/rating";
import type { Match, MatchSide, PlayerKey, PlayerPair } from "@/lib/domain/types";
import { formatMatchDate, signed } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

function SideLine({ pair, k, side, won, elo, align }: {
  pair: PlayerPair;
  k: PlayerKey;
  side: MatchSide;
  won: boolean;
  /** Rounded Elo change for this player in this match; null when it doesn't count (not confirmed). */
  elo: number | null;
  align: "left" | "right";
}) {
  const sub = [side.team_name, side.onscreen_label && side.onscreen_label !== side.team_name ? `“${side.onscreen_label}”` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={cn("flex min-w-0 items-center gap-3", align === "right" && "flex-row-reverse text-right")}>
      <span
        className={cn(
          "text-3xl leading-none font-semibold tabular",
          won ? (k === "a" ? "text-player-a" : "text-player-b") : "text-muted-foreground",
        )}
      >
        {side.goals}
      </span>
      <div className="min-w-0">
        <p className={cn("flex items-baseline gap-1.5 text-sm font-semibold", align === "right" && "flex-row-reverse")}>
          <span className={cn("truncate", k === "a" ? "text-player-a" : "text-player-b", !won && "opacity-80")}>{pair[k].display_name}</span>
          {elo !== null && (
            <span className={cn("shrink-0 text-xs font-medium tabular", elo > 0 ? "text-success" : elo < 0 ? "text-destructive" : "text-muted-foreground")}>
              {signed(elo)}
            </span>
          )}
        </p>
        {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

/**
 * One match, laid out like the screenshot (left side of the screen on the
 * left), players in their own colours, with each player's Elo change.
 */
export async function MatchCard({ match, roster, elo }: { match: Match; roster: Roster; elo: EloMatchChange | null }) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const pair = pairFor(roster, match.sides[0].player_id, match.sides[1].player_id);
  const pm = toPerspective(match, pair);
  const left = sideOnScreen(match, "left");
  const right = sideOnScreen(match, "right");
  const keyOf = (s: MatchSide): PlayerKey => (s.player_id === pair.a.id ? "a" : "b");
  const uploader = roster.find((p) => p.id === match.created_by)?.display_name ?? "—";
  const date = formatMatchDate(match.played_at, locale);
  const deltaFor = (s: MatchSide) => (elo ? displayedDelta(elo, s.player_id) : null);

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
          {hasShootout(left, right) && (
            <span className="text-xs font-medium text-muted-foreground tabular">{t("pk.short", { l: left.penalties!, r: right.penalties! })}</span>
          )}
          <StatusBadge status={match.status} label={t(`status.${match.status}`)} />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <SideLine pair={pair} k={keyOf(left)} side={left} won={pm.winner === keyOf(left)} elo={deltaFor(left)} align="left" />
        <span className="text-xs text-muted-foreground">{t("common.vs")}</span>
        <SideLine pair={pair} k={keyOf(right)} side={right} won={pm.winner === keyOf(right)} elo={deltaFor(right)} align="right" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="size-3.5" aria-hidden /> {date ?? t("common.dateUnknown")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Upload className="size-3.5" aria-hidden /> {uploader}
        </span>
      </div>
    </Link>
  );
}
