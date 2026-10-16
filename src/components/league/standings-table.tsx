import { HelpCircle, Trophy } from "lucide-react";
import Link from "next/link";
import { PlayerAvatar } from "@/components/player/player-avatar";
import { seatColor, seatStyle } from "@/components/player/seat-scope";
import { ELO, type EloPlayer } from "@/lib/domain/elo";
import type { StandingRow } from "@/lib/domain/league";
import type { Outcome } from "@/lib/domain/types";
import { signed } from "@/lib/format";
import type { Translate } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

export type RankMode = "elo" | "points";

interface StandingsTableProps {
  rows: StandingRow[];
  elo: Map<string, EloPlayer>;
  mode: RankMode;
  /** Links that switch the ranking, keeping the page's other filters. */
  modeHrefs: Record<RankMode, string>;
  meId: string | null;
}

function FormDots({ form, seat, t }: { form: Outcome[]; seat: number; t: Translate }) {
  return (
    <ol className="flex gap-1" aria-label={t("league.lastFive")}>
      {form.map((o, i) => (
        <li
          key={i}
          title={t(o === "W" ? "outcome.win" : o === "D" ? "outcome.draw" : "outcome.loss")}
          className={cn(
            "flex size-5 items-center justify-center rounded text-[0.6rem] font-semibold",
            o === "D" && "bg-draw/25 text-draw",
            o === "L" && "border border-border text-muted-foreground",
          )}
          style={o === "W" ? { background: seatColor(seat), color: "var(--on-seat)" } : undefined}
        >
          {t(`outcome.${o}`)}
        </li>
      ))}
    </ol>
  );
}

function EloCell({ player, seat, primary, t }: { player: EloPlayer; seat: number; primary: boolean; t: Translate }) {
  const delta = Math.round(player.lastDelta);
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className={cn("tabular", primary ? "text-lg font-semibold" : "font-medium", player.provisional && "opacity-60")} style={primary ? { color: seatColor(seat) } : undefined}>
        {Math.round(player.rating)}
      </span>
      {player.provisional ? (
        <span className="text-[0.65rem] whitespace-nowrap text-muted-foreground" title={t("elo.provisionalHint", { n: ELO.provisionalGames })}>
          {t("elo.provisional")}
        </span>
      ) : (
        delta !== 0 && <span className={cn("text-[0.65rem] tabular", delta > 0 ? "text-success" : "text-destructive")}>{signed(delta)}</span>
      )}
    </div>
  );
}

/**
 * League table. Ranked by Elo (skill, adjusted for opponent strength) or by
 * league points (3 per win, 1 per draw); both are always shown.
 */
export async function StandingsTable({ rows, elo, mode, modeHrefs, meId }: StandingsTableProps) {
  const t = await getT();
  const ratingOf = (r: StandingRow) => elo.get(r.player.id)?.rating ?? ELO.start;
  const ordered =
    mode === "elo" ? [...rows].sort((x, y) => ratingOf(y) - ratingOf(x) || y.points - x.points || x.player.seat - y.player.seat) : rows;
  const anyPlayed = rows.some((r) => r.played > 0);
  const tab = "h-8 rounded-md px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

  return (
    <section aria-labelledby="standings-heading" className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
        <h2 id="standings-heading" className="sr-only">
          {t("league.table")}
        </h2>
        <div className="inline-flex rounded-lg border bg-card p-1" role="tablist" aria-label={t("league.table")}>
          {(["elo", "points"] as const).map((m) => (
            <Link
              key={m}
              href={modeHrefs[m]}
              scroll={false}
              role="tab"
              aria-selected={mode === m}
              className={cn(tab, mode === m ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {t(m === "elo" ? "rank.elo" : "rank.points")}
            </Link>
          ))}
        </div>
        {mode === "elo" ? (
          <Link href="/guide/elo" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            <HelpCircle className="size-3.5" aria-hidden /> {t("elo.how")}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">{t("league.rules")}</span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[20rem] text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="w-8 py-2 pl-4 text-left font-medium sm:pl-6">{t("league.col.rank")}</th>
              <th scope="col" className="py-2 text-left font-medium">{t("league.col.player")}</th>
              <th scope="col" className="py-2 text-center font-medium">{t("league.col.played")}</th>
              <th scope="col" className="hidden py-2 text-center font-medium sm:table-cell">{t("league.col.won")}</th>
              <th scope="col" className="hidden py-2 text-center font-medium sm:table-cell">{t("league.col.drawn")}</th>
              <th scope="col" className="hidden py-2 text-center font-medium sm:table-cell">{t("league.col.lost")}</th>
              {/* Goals for/against: desktop, and phones turned sideways. */}
              <th scope="col" className="hidden py-2 text-center font-medium landscape:table-cell sm:table-cell">{t("league.col.for")}</th>
              <th scope="col" className="hidden py-2 text-center font-medium landscape:table-cell sm:table-cell">{t("league.col.against")}</th>
              <th scope="col" className="py-2 text-center font-medium">{t("league.col.diff")}</th>
              <th scope="col" className="py-2 text-right font-medium">{t("league.col.points")}</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium sm:pr-6">{t("elo.col")}</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((r, i) => {
              const leader = anyPlayed && i === 0;
              const rating = elo.get(r.player.id) ?? { rating: ELO.start, games: 0, provisional: true, lastDelta: 0 };
              return (
                <tr key={r.player.id} className="border-t" style={seatStyle(r.player.seat)}>
                  <td className="py-3 pl-4 font-semibold text-muted-foreground tabular sm:pl-6">
                    {leader ? <Trophy className="size-4 text-gold" aria-label={t("league.leader")} /> : i + 1}
                  </td>
                  <td className="py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <PlayerAvatar name={r.player.display_name} avatarUrl={r.player.avatar_url} playerKey="a" size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold" style={{ color: seatColor(r.player.seat) }}>
                          {r.player.display_name}
                          {r.player.id === meId && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t("common.you")}</span>}
                        </p>
                        {r.form.length > 0 && (
                          <div className="mt-1">
                            <FormDots form={r.form} seat={r.player.seat} t={t} />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-center tabular">{r.played}</td>
                  <td className="hidden py-3 text-center tabular sm:table-cell">{r.wins}</td>
                  <td className="hidden py-3 text-center tabular sm:table-cell">{r.draws}</td>
                  <td className="hidden py-3 text-center tabular sm:table-cell">{r.losses}</td>
                  <td className="hidden py-3 text-center tabular landscape:table-cell sm:table-cell">{r.goalsFor}</td>
                  <td className="hidden py-3 text-center tabular landscape:table-cell sm:table-cell">{r.goalsAgainst}</td>
                  <td className="py-3 text-center tabular">{signed(r.goalDiff)}</td>
                  <td
                    className={cn("py-3 text-right tabular", mode === "points" ? "text-lg font-semibold" : "font-medium")}
                    style={mode === "points" ? { color: seatColor(r.player.seat) } : undefined}
                  >
                    {r.points}
                  </td>
                  <td className="py-3 pr-4 text-right sm:pr-6">
                    <EloCell player={rating} seat={r.player.seat} primary={mode === "elo"} t={t} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
