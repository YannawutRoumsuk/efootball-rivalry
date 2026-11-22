"use client";

import type { ReactNode } from "react";
import { seatColor } from "@/components/player/seat-scope";
import {
  goalMargin,
  matchTime,
  playerByOutcome,
  squadOutcome,
  teamStatsByOutcome,
  type SquadMatch,
  type SquadOutcome,
  type SquadStatKey,
  type TeamStatKey,
} from "@/lib/domain/squad";
import { fmt, pct } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";
import { cn } from "@/lib/utils";
import type { ExplorerPlayer } from "./squad-explorer";

const TEAM_KEYS: TeamStatKey[] = ["possession_pct", "shots", "shots_on_target", "passes", "successful_passes", "interceptions", "tackles"];
const PLAYER_KEYS: SquadStatKey[] = ["total_points", "goals", "assists", "shots", "passes", "intercepts", "tackles"];
const OUTCOME_COLOR: Record<SquadOutcome, string> = {
  W: "var(--color-emerald-500, #10b981)",
  D: "var(--muted-foreground)",
  L: "var(--color-red-500, #ef4444)",
};

function Block({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

/** Wins and losses: by how much, what the team did, and who played how. */
export function ResultsView({ players, matches }: { players: ExplorerPlayer[]; matches: SquadMatch[] }) {
  const t = useT();
  const scored = [...matches].filter((m) => goalMargin(m) !== null).sort((a, b) => matchTime(a) - matchTime(b));
  if (scored.length === 0) return <p className="text-sm text-muted-foreground">{t("squad.res.none")}</p>;
  const maxMargin = Math.max(1, ...scored.map((m) => Math.abs(goalMargin(m)!)));
  const team = teamStatsByOutcome(matches, TEAM_KEYS);
  const outcomes: SquadOutcome[] = (["W", "D", "L"] as const).filter((o) => team[o].games > 0);
  const show = (k: TeamStatKey, v: number | null | undefined) => (k === "possession_pct" ? pct(v ?? null, 0) : fmt(v ?? null, 1));

  return (
    <div className="space-y-6">
      <Block title={t("squad.res.margin")} sub={t("squad.res.marginSub")}>
        <ul className="space-y-1">
          {scored.map((m, i) => {
            const margin = goalMargin(m)!;
            const o = squadOutcome(m)!;
            const width = (Math.abs(margin) / maxMargin) * 50;
            return (
              <li key={m.id} className="grid grid-cols-[2rem_1fr_3.5rem] items-center gap-2 text-xs">
                <span className="text-muted-foreground tabular">#{i + 1}</span>
                <span className="relative h-5 rounded bg-muted/40" title={m.team_name ?? ""}>
                  <span className="absolute inset-y-0 left-1/2 w-px bg-border" aria-hidden />
                  {margin !== 0 ? (
                    <span
                      className="absolute inset-y-0.5 rounded"
                      style={{ background: OUTCOME_COLOR[o], width: `${width}%`, left: margin > 0 ? "50%" : `${50 - width}%` }}
                    />
                  ) : (
                    <span className="absolute inset-y-0.5 left-[calc(50%-3px)] w-1.5 rounded" style={{ background: OUTCOME_COLOR[o] }} />
                  )}
                </span>
                <span className="text-right font-semibold tabular" style={{ color: OUTCOME_COLOR[o] }}>
                  {m.goals_for}–{m.goals_against}
                </span>
              </li>
            );
          })}
        </ul>
      </Block>

      <Block title={t("squad.res.team")} sub={t("squad.res.teamSub")}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1 text-left font-medium">{t("squad.stat")}</th>
                {outcomes.map((o) => (
                  <th key={o} colSpan={2} className="py-1 text-center font-semibold" style={{ color: OUTCOME_COLOR[o] }}>
                    {t(`squad.res.when${o}` as MessageKey, { n: team[o].games })}
                  </th>
                ))}
              </tr>
              <tr className="text-[0.7rem] text-muted-foreground">
                <th />
                {outcomes.map((o) => (
                  <FragmentCells key={o} a={t("squad.ft.us")} b={t("squad.ft.them")} />
                ))}
              </tr>
            </thead>
            <tbody>
              {TEAM_KEYS.map((k) => (
                <tr key={k} className="border-t">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                    {t(`stat.${k}` as MessageKey)}
                  </th>
                  {outcomes.map((o) => {
                    const us = team[o].us[k] ?? null;
                    const them = team[o].them[k] ?? null;
                    const better = us !== null && them !== null && us !== them ? (us > them ? "us" : "them") : null;
                    return (
                      <FragmentCells
                        key={o}
                        a={<span className={cn(better === "us" && "font-bold")}>{show(k, us)}</span>}
                        b={<span className={cn("text-muted-foreground", better === "them" && "font-bold text-foreground")}>{show(k, them)}</span>}
                        numeric
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Block>

      <Block title={t("squad.res.players")} sub={t("squad.res.playersSub")}>
        <div className="grid gap-3 md:grid-cols-3">
          {players.map((p) => {
            const split = playerByOutcome(matches, p.id);
            const max = (k: SquadStatKey) => Math.max(0, ...outcomes.map((o) => split[o].stats[k].average ?? 0));
            return (
              <figure key={p.id} className="rounded-lg border p-3">
                <figcaption className="mb-2 flex items-baseline justify-between text-sm font-bold" style={{ color: seatColor(p.seat) }}>
                  {p.name}
                  <span className="text-xs font-normal text-muted-foreground">
                    {outcomes.map((o) => `${t(`outcome.${o}`)} ${split[o].games}`).join(" · ")}
                  </span>
                </figcaption>
                <ul className="space-y-2">
                  {PLAYER_KEYS.map((k) => (
                    <li key={k} className="text-xs">
                      <span className="text-muted-foreground">{t(`sq.${k}` as MessageKey)}</span>
                      {outcomes.map((o) => {
                        const v = split[o].stats[k].average;
                        const m = max(k);
                        return (
                          <span key={o} className="mt-0.5 grid grid-cols-[1rem_1fr_2.75rem] items-center gap-1.5">
                            <span className="font-semibold" style={{ color: OUTCOME_COLOR[o] }}>
                              {t(`outcome.${o}`)}
                            </span>
                            <span className="relative h-2" aria-hidden>
                              {v !== null && m > 0 && (
                                <span className="absolute inset-y-0 left-0 min-w-[2px] rounded-r" style={{ width: `${(v / m) * 100}%`, background: OUTCOME_COLOR[o] }} />
                              )}
                            </span>
                            <span className="text-right tabular">{fmt(v, k === "total_points" ? 0 : 1)}</span>
                          </span>
                        );
                      })}
                    </li>
                  ))}
                </ul>
              </figure>
            );
          })}
        </div>
      </Block>
    </div>
  );
}

function FragmentCells({ a, b, numeric }: { a: ReactNode; b: ReactNode; numeric?: boolean }) {
  return (
    <>
      <td className={cn("px-1.5 py-1.5", numeric ? "text-right tabular" : "text-right")}>{a}</td>
      <td className={cn("px-1.5 py-1.5", numeric ? "text-right tabular" : "text-right")}>{b}</td>
    </>
  );
}
