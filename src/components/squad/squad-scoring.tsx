"use client";

import { Goal } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { seatColor } from "@/components/player/seat-scope";
import { FormulaHint } from "@/components/ui/formula-hint";
import type { SquadMatch } from "@/lib/domain/squad";
import { scoringBoard, scoringTimeline, type ScoringRow } from "@/lib/domain/squad-scoring";
import { pct } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { LeaderValue } from "./leader-value";
import type { ExplorerPlayer } from "./squad-explorer";

const tooltipStyle = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--foreground)" },
  labelStyle: { color: "var(--muted-foreground)", marginBottom: 4 },
};

type Column = "goals" | "assists" | "contributions";

/** The single top value of a column; ties or an all-zero column have no leader. */
function leaderOf(rows: readonly ScoringRow[], col: Column): string | null {
  const best = Math.max(...rows.map((r) => r[col]));
  const top = rows.filter((r) => r[col] === best);
  return best > 0 && top.length === 1 ? top[0].playerId : null;
}

function Cell({ value, lead, seat }: { value: number; lead: boolean; seat: number }): ReactNode {
  return lead ? <LeaderValue seat={seat}>{value}</LeaderValue> : <span className="px-1.5 font-bold">{value}</span>;
}

interface Props {
  players: ExplorerPlayer[];
  matches: SquadMatch[];
}

/** Career goals and assists in 3v3: a ranked board and the running total match by match. */
export function SquadScoring({ players, matches }: Props) {
  const t = useT();
  const ids = useMemo(() => players.map((p) => p.id), [players]);
  const board = useMemo(() => scoringBoard(matches, ids), [matches, ids]);
  const line = useMemo(() => scoringTimeline(matches, ids).map((pt) => ({ label: pt.label, ...pt.values })), [matches, ids]);
  const seatOf = (id: string) => players.find((p) => p.id === id)?.seat ?? 1;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "—";
  const maxContrib = Math.max(1, ...board.map((r) => r.contributions));
  const leads = { goals: leaderOf(board, "goals"), assists: leaderOf(board, "assists"), contributions: leaderOf(board, "contributions") };
  const teamGoals = board.reduce((sum, r) => sum + r.goals, 0);
  const teamAssists = board.reduce((sum, r) => sum + r.assists, 0);

  return (
    <section className="panel p-4" aria-labelledby="squad-scoring-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="squad-scoring-heading" className="flex items-center gap-2 text-sm font-semibold">
            <Goal className="size-4" aria-hidden />
            {t("squad.score.title")}
            <FormulaHint id="scoring" />
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("squad.score.sub")}</p>
        </div>
        <p className="text-xs text-muted-foreground tabular">{t("squad.score.team", { g: teamGoals, a: teamAssists })}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm tabular">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="pb-2 text-left font-medium">{t("squad.score.player")}</th>
                <th className="pb-2 text-right font-medium" title={t("sq.goals")}>{t("squad.score.g")}</th>
                <th className="pb-2 text-right font-medium" title={t("sq.assists")}>{t("squad.score.a")}</th>
                <th className="pb-2 text-right font-medium">{t("squad.score.ga")}</th>
                <th className="pb-2 text-right font-medium">{t("squad.score.perGame")}</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r, i) => {
                const seat = seatOf(r.playerId);
                const color = seatColor(seat);
                return (
                  <tr key={r.playerId} className="border-b last:border-0">
                    <td className="py-2.5 pr-2">
                      <span className="flex items-baseline gap-2">
                        <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                        <span className="truncate font-bold" style={{ color }}>
                          {nameOf(r.playerId)}
                        </span>
                      </span>
                      {/* Goals solid, assists faded: one bar per player against the top scorer. */}
                      <span className="mt-1.5 ml-6 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span style={{ width: `${(r.goals / maxContrib) * 100}%`, background: color }} />
                        <span style={{ width: `${(r.assists / maxContrib) * 100}%`, background: color, opacity: 0.4 }} />
                      </span>
                      <span className="mt-1 ml-6 block text-[11px] text-muted-foreground">
                        {t("squad.score.detail", { n: r.games, conv: pct(r.conversion, 0), best: r.best })}
                      </span>
                    </td>
                    <td className="py-2.5 text-right align-top">
                      <Cell value={r.goals} lead={leads.goals === r.playerId} seat={seat} />
                    </td>
                    <td className="py-2.5 text-right align-top">
                      <Cell value={r.assists} lead={leads.assists === r.playerId} seat={seat} />
                    </td>
                    <td className="py-2.5 text-right align-top text-base">
                      <Cell value={r.contributions} lead={leads.contributions === r.playerId} seat={seat} />
                    </td>
                    <td className="py-2.5 pl-2 text-right align-top text-muted-foreground">{r.perGame === null ? "—" : r.perGame.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <p className="mb-2 text-xs text-muted-foreground">{t("squad.score.cumulative")}</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={line} margin={{ left: -18, right: 8, top: 4 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                {players.map((p) => (
                  <Line key={p.id} dataKey={p.id} name={p.name} stroke={seatColor(p.seat)} strokeWidth={2.5} dot={{ r: 3.5 }} type="linear" />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
