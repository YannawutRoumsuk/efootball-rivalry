import { Crown } from "lucide-react";
import Link from "next/link";
import { seatColor } from "@/components/player/seat-scope";
import { AwardList, tallyAwards } from "./award-chip";
import type { RosterPlayer } from "@/lib/domain/league";
import { mvpOf, squadOutcome, type SquadMatch } from "@/lib/domain/squad";
import { formatMatchDate } from "@/lib/format";
import type { Locale, Translate } from "@/lib/i18n/core";
import { cn } from "@/lib/utils";

const OUTCOME_STYLE = {
  W: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  D: "bg-muted text-muted-foreground",
  L: "bg-red-500/15 text-red-700 dark:text-red-400",
} as const;

export function columnName(p: SquadMatch["players"][number], roster: readonly RosterPlayer[], t: Translate): string {
  return roster.find((r) => r.id === p.player_id)?.display_name ?? p.ingame_name ?? t("squad.guest");
}

/** Compact 3v3 result: score, then each column's total points; the MVP wears the crown. */
export function SquadMatchCard({ match, roster, t, locale }: { match: SquadMatch; roster: RosterPlayer[]; t: Translate; locale: Locale }) {
  const outcome = squadOutcome(match);
  const mvp = mvpOf(match);
  return (
    <Link
      href={`/squad/${match.id}`}
      className="panel block p-3.5 transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <div className="mb-2.5 flex items-center gap-2 text-xs text-muted-foreground">
        {outcome && <span className={cn("rounded px-1.5 py-0.5 font-bold", OUTCOME_STYLE[outcome])}>{t(`outcome.${outcome}`)}</span>}
        <span className="font-semibold text-foreground">{match.team_name ?? t("squad.match")}</span>
        {match.goals_for !== null && match.goals_against !== null && (
          <span className="tabular font-semibold text-foreground">
            {match.goals_for}–{match.goals_against}
          </span>
        )}
        {match.opponent_name && <span className="truncate">{t("common.vs")} {match.opponent_name}</span>}
        <span className="ml-auto">{formatMatchDate(match.played_at ?? match.created_at, locale)}</span>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {match.players.map((p) => {
          const seat = roster.find((r) => r.id === p.player_id)?.seat;
          const isMvp = mvp !== null && p.player_id === mvp;
          return (
            <li key={p.slot} className={cn("min-w-0 rounded-lg border px-2 py-1.5", isMvp && "leader-row")} style={isMvp && seat ? ({ "--glow": seatColor(seat) } as React.CSSProperties) : undefined}>
              <span className="flex items-center gap-1 truncate text-xs font-semibold" style={seat ? { color: seatColor(seat) } : undefined}>
                {isMvp && <Crown className="size-3 shrink-0" aria-label={t("squad.mvp")} />}
                <span className="truncate">{columnName(p, roster, t)}</span>
              </span>
              <span className="block text-base font-bold tabular">{p.stats.total_points ?? "—"}</span>
              <span className="block text-[0.7rem] text-muted-foreground tabular">
                {p.stats.goals ?? "–"}G · {p.stats.assists ?? "–"}A
              </span>
              {p.awards && p.awards.length > 0 && <AwardList awards={tallyAwards([p.awards]).slice(0, 1)} size="xs" className="mt-1" />}
            </li>
          );
        })}
      </ul>
    </Link>
  );
}
