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
import type { ExplorerPlayer } from "./squad-explorer";

const GOOD = "#10b981";
const BAD = "#ef4444";

export const metricLabel = (m: InsightMetric): MessageKey =>
  m === "shot_accuracy" || m === "pass_completion" || m === "dribble_success" ? (`squad.m.${m}` as MessageKey) : (`sq.${m}` as MessageKey);
const show = (m: InsightMetric, v: number | null) => (PERCENT_INSIGHTS.has(m) ? pct(v, 0) : fmt(v, v !== null && v >= 100 ? 0 : 1));

/** Who is best and worst at each area, then each player's strengths and what to work on. */
export function SquadInsights({ players, summaries }: { players: ExplorerPlayer[]; summaries: SquadPlayerSummary[] }) {
  const t = useT();
  const table = standings(summaries.filter((s) => players.some((p) => p.id === s.playerId)));
  const rows = INSIGHT_METRICS.filter((m) => players.some((p) => table.get(p.id)?.some((s) => s.metric === m)));
  const games = Math.max(0, ...summaries.map((s) => s.games));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t("squad.ins.none")}</p>;

  return (
    <div className="space-y-5">
      {games < 3 && <p className="text-xs text-amber-700 dark:text-amber-400">{t("squad.ins.fewGames", { n: games })}</p>}

      <div className="grid gap-3 md:grid-cols-3">
        {players.map((p) => {
          const { strengths, weaknesses } = strengthsAndWeaknesses(table.get(p.id) ?? []);
          return (
            <figure key={p.id} className="overflow-hidden rounded-xl border">
              <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-sm font-bold" style={{ background: `color-mix(in oklch, ${seatColor(p.seat)} 16%, transparent)`, color: seatColor(p.seat) }}>
                {p.name}
              </figcaption>
              <div className="space-y-3 p-3">
                <section>
                  <h4 className="mb-1.5 flex items-center gap-1 text-xs font-semibold" style={{ color: GOOD }}>
                    <CheckCircle2 className="size-3.5" aria-hidden /> {t("squad.ins.good")}
                  </h4>
                  {strengths.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("squad.ins.noneGood")}</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {strengths.map((s) => (
                        <InsightRow key={s.metric} s={s} tone="good" />
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
                        <InsightRow key={s.metric} s={s} tone="bad" tip />
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </figure>
          );
        })}
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
                  <th key={p.id} className="py-1.5 text-right font-bold" style={{ color: seatColor(p.seat) }}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m} className="border-t">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                    {t(metricLabel(m))}
                  </th>
                  {players.map((p) => {
                    const s = table.get(p.id)?.find((x) => x.metric === m);
                    return (
                      <td key={p.id} className="py-1 pl-2 text-right tabular">
                        {!s ? (
                          <span className="text-muted-foreground">—</span>
                        ) : s.best || s.worst ? (
                          <span
                            className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold", s.best && "leader-row")}
                            style={{ background: s.best ? GOOD : BAD, color: "#fff", ...(s.best ? ({ "--glow": GOOD } as CSSProperties) : {}) }}
                            title={t(s.best ? "squad.ins.bestInTeam" : "squad.ins.worstInTeam")}
                          >
                            {s.best ? <Crown className="size-3" aria-hidden /> : <TrendingDown className="size-3" aria-hidden />}
                            {show(m, s.value)}
                          </span>
                        ) : (
                          show(m, s.value)
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

function InsightRow({ s, tone, tip = false }: { s: Standing; tone: "good" | "bad"; tip?: boolean }) {
  const t = useT();
  const color = tone === "good" ? GOOD : BAD;
  const percent = Math.round(Math.abs(s.lift) * 100);
  return (
    <li className="text-xs">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{t(metricLabel(s.metric))}</span>
        <span className="shrink-0 font-bold tabular" style={{ color }}>
          {show(s.metric, s.value)}
        </span>
      </span>
      <span className="block text-[0.7rem] text-muted-foreground">
        {s.best && tone === "good" ? `${t("squad.ins.bestInTeam")} · ` : s.worst && tone === "bad" ? `${t("squad.ins.worstInTeam")} · ` : ""}
        {t(tone === "good" ? "squad.ins.above" : "squad.ins.below", { n: percent, avg: show(s.metric, s.teamAvg) })}
      </span>
      {tip && <span className="mt-0.5 block rounded bg-muted/60 px-1.5 py-1 text-[0.7rem]">💡 {t(`squad.tip.${s.metric}` as MessageKey)}</span>}
    </li>
  );
}
