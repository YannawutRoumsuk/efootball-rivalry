"use client";

import { AlertTriangle, CheckCircle2, Crown, TrendingDown } from "lucide-react";
import type { CSSProperties } from "react";
import { seatColor } from "@/components/player/seat-scope";
import type { SquadPlayerSummary } from "@/lib/domain/squad";
import { INSIGHT_METRICS, PERCENT_INSIGHTS, standings, strengthsAndWeaknesses, type InsightMetric, type Standing } from "@/lib/domain/squad-insights";
import { fmt, pct } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";
import { cn } from "@/lib/utils";
import { LeaderValue } from "./leader-value";
import type { ExplorerPlayer } from "./squad-explorer";

const BAD = "#ef4444";

export const metricLabel = (m: InsightMetric): MessageKey =>
  m === "shot_accuracy" || m === "pass_completion" || m === "dribble_success" ? (`squad.m.${m}` as MessageKey) : (`sq.${m}` as MessageKey);
const show = (m: InsightMetric, v: number | null) => (PERCENT_INSIGHTS.has(m) ? pct(v, 0) : fmt(v, v !== null && v >= 100 ? 0 : 1));

interface Props {
  players: ExplorerPlayer[];
  summaries: SquadPlayerSummary[];
  /** Profile page: only this player's card (wide), the matrix with their column marked. */
  onlyId?: string;
}

/** Each player's strengths and what to work on, then who is best and worst at every area. */
export function SquadInsights({ players, summaries, onlyId }: Props) {
  const t = useT();
  const table = standings(summaries.filter((s) => players.some((p) => p.id === s.playerId)));
  const rows = INSIGHT_METRICS.filter((m) => players.some((p) => table.get(p.id)?.some((s) => s.metric === m)));
  const games = Math.max(0, ...summaries.map((s) => s.games));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("squad.ins.none")}</p>;
  const cards = onlyId ? players.filter((p) => p.id === onlyId) : players;

  return (
    <div className="space-y-5">
      {games < 3 && <p className="text-xs text-amber-700 dark:text-amber-400">{t("squad.ins.fewGames", { n: games })}</p>}

      <div className={cn("grid gap-3", !onlyId && "md:grid-cols-3")}>
        {cards.map((p) => (
          <InsightCard key={p.id} player={p} list={table.get(p.id) ?? []} wide={Boolean(onlyId)} />
        ))}
      </div>

      <section className="space-y-2">
        <div>
          <h3 className="text-sm font-semibold">{t("squad.ins.matrix")}</h3>
          <p className="text-xs text-muted-foreground">{t("squad.ins.matrixSub")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[24rem] text-sm">
            <thead>
              <tr className="text-xs">
                <th className="py-1.5 text-left font-medium text-muted-foreground">{t("squad.stat")}</th>
                {players.map((p) => (
                  <th
                    key={p.id}
                    className={cn("py-1.5 pr-1 text-right font-bold", onlyId === p.id && "rounded-t-md")}
                    style={{ color: seatColor(p.seat), ...(onlyId === p.id ? { background: `color-mix(in oklch, ${seatColor(p.seat)} 10%, transparent)` } : {}) }}
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m} className="border-t">
                  <th scope="row" className="py-2 pr-2 text-left text-xs font-normal text-muted-foreground sm:text-sm">
                    {t(metricLabel(m))}
                  </th>
                  {players.map((p) => {
                    const s = table.get(p.id)?.find((x) => x.metric === m);
                    return (
                      <td
                        key={p.id}
                        className="py-1.5 pr-1 pl-2 text-right text-xs tabular sm:text-sm"
                        style={onlyId === p.id ? { background: `color-mix(in oklch, ${seatColor(p.seat)} 10%, transparent)` } : undefined}
                      >
                        {!s ? (
                          <span className="text-muted-foreground">—</span>
                        ) : s.best ? (
                          <LeaderValue seat={p.seat} title={t("squad.ins.bestInTeam")}>
                            {show(m, s.value)}
                          </LeaderValue>
                        ) : s.worst ? (
                          <span className="inline-flex items-center gap-0.5 font-medium" style={{ color: BAD }} title={t("squad.ins.worstInTeam")}>
                            <TrendingDown className="size-3" aria-hidden />
                            {show(m, s.value)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{show(m, s.value)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function InsightCard({ player, list, wide }: { player: ExplorerPlayer; list: Standing[]; wide: boolean }) {
  const t = useT();
  const { strengths, weaknesses } = strengthsAndWeaknesses(list, wide ? 4 : 3);
  const color = seatColor(player.seat);
  return (
    <figure className="overflow-hidden rounded-xl border">
      <figcaption className="px-3 py-2 text-sm font-bold" style={{ background: `color-mix(in oklch, ${color} 16%, transparent)`, color }}>
        {player.name}
      </figcaption>
      <div className={cn("grid gap-4 p-3", wide && "md:grid-cols-2")}>
        <section>
          <h4 className="mb-1.5 flex items-center gap-1 text-xs font-semibold" style={{ color }}>
            <CheckCircle2 className="size-3.5" aria-hidden /> {t("squad.ins.good")}
          </h4>
          {strengths.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("squad.ins.noneGood")}</p>
          ) : (
            <ul className="space-y-1">
              {strengths.map((s) => (
                <InsightRow key={s.metric} s={s} seat={player.seat} tone="good" />
              ))}
            </ul>
          )}
        </section>
        <section>
          <h4 className="mb-1.5 flex items-center gap-1 text-xs font-semibold" style={{ color: BAD }}>
            <AlertTriangle className="size-3.5" aria-hidden /> {t("squad.ins.fix")}
          </h4>
          {weaknesses.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("squad.ins.noneBad")}</p>
          ) : (
            <ul className="space-y-2">
              {weaknesses.map((s) => (
                <InsightRow key={s.metric} s={s} seat={player.seat} tone="bad" />
              ))}
            </ul>
          )}
        </section>
      </div>
    </figure>
  );
}

/** A strength gets the stats-board leader treatment when it's the team's best; a weakness stays plain red with a tip. */
function InsightRow({ s, seat, tone }: { s: Standing; seat: number; tone: "good" | "bad" }) {
  const t = useT();
  const percent = Math.round(Math.abs(s.lift) * 100);
  const lead = tone === "good" && s.best;
  return (
    <li
      className={cn("-mx-1.5 rounded-md px-1.5 py-1 text-xs", lead && "leader-row")}
      style={lead ? ({ "--glow": seatColor(seat) } as CSSProperties) : undefined}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 font-semibold">
          {lead && <Crown className="size-3.5 shrink-0" style={{ color: seatColor(seat) }} aria-hidden />}
          <span className="truncate">{t(metricLabel(s.metric))}</span>
        </span>
        {lead ? (
          <span className="shrink-0 rounded px-1.5 py-0.5 font-bold tabular" style={{ background: seatColor(seat), color: "var(--on-seat)" }}>
            {show(s.metric, s.value)}
          </span>
        ) : (
          <span className="shrink-0 font-bold tabular" style={{ color: tone === "good" ? seatColor(seat) : BAD }}>
            {show(s.metric, s.value)}
          </span>
        )}
      </span>
      <span className="block text-[0.7rem] text-muted-foreground">
        {lead ? `${t("squad.ins.bestInTeam")} · ` : tone === "bad" && s.worst ? `${t("squad.ins.worstInTeam")} · ` : ""}
        {t(tone === "good" ? "squad.ins.above" : "squad.ins.below", { n: percent, avg: show(s.metric, s.teamAvg) })}
      </span>
      {tone === "bad" && <span className="mt-1 block rounded bg-muted/60 px-1.5 py-1 text-[0.7rem]">💡 {t(`squad.tip.${s.metric}` as MessageKey)}</span>}
    </li>
  );
}
