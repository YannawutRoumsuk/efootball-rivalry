"use client";

import { Crown } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { seatColor } from "@/components/player/seat-scope";
import { leaders } from "@/lib/domain/player-stats";
import {
  RADAR_KEYS,
  rowFor,
  SQUAD_ROWS,
  squadTimeline,
  type SquadGroup,
  type SquadMatch,
  type SquadPlayerSummary,
  type SquadStatKey,
} from "@/lib/domain/squad";
import { COMPARE_METRICS, PERCENT_METRICS, type ModeComparison } from "@/lib/domain/squad-compare";
import { fmt, pct } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";
import { cn } from "@/lib/utils";
import { ResultsView } from "./squad-results";

export interface ExplorerPlayer {
  id: string;
  name: string;
  seat: number;
}

interface Props {
  players: ExplorerPlayer[];
  summaries: SquadPlayerSummary[];
  matches: SquadMatch[];
  comparison: ModeComparison[];
}

type Tab = "results" | "radar" | "trend" | "compare" | "vs";
const TABS: Array<{ id: Tab; label: MessageKey }> = [
  { id: "results", label: "squad.tab.results" },
  { id: "radar", label: "squad.tab.radar" },
  { id: "compare", label: "squad.tab.compare" },
  { id: "trend", label: "squad.tab.trend" },
  { id: "vs", label: "squad.tab.vs1v1" },
];
const COMPARE_GROUPS: SquadGroup[] = ["attack", "buildup", "movement", "defence", "rating"];
const tooltipStyle = {
  contentStyle: { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--foreground)" },
  labelStyle: { color: "var(--muted-foreground)", marginBottom: 4 },
};

/** One panel, four ways to look at the 3v3 numbers. */
export function SquadExplorer({ players, summaries, matches, comparison }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("results");
  return (
    <section className="panel overflow-hidden">
      <div role="tablist" aria-label={t("squad.title")} className="flex gap-1 overflow-x-auto border-b p-2">
        {TABS.map((x) => (
          <button
            key={x.id}
            role="tab"
            type="button"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={cn(
              "h-9 shrink-0 rounded-lg px-3.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              tab === x.id ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {t(x.label)}
          </button>
        ))}
      </div>
      <div className="p-4 sm:p-5" role="tabpanel">
        {tab === "radar" && <RadarView players={players} summaries={summaries} />}
        {tab === "trend" && <TrendView players={players} matches={matches} />}
        {tab === "compare" && <CompareView players={players} summaries={summaries} />}
        {tab === "vs" && <VsView players={players} comparison={comparison} />}
        {tab === "results" && <ResultsView players={players} matches={matches} />}
      </div>
    </section>
  );
}

function Sub({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-xs text-muted-foreground">{children}</p>;
}

function RadarView({ players, summaries }: { players: ExplorerPlayer[]; summaries: SquadPlayerSummary[] }) {
  const t = useT();
  const values = Object.fromEntries(
    players.map((p) => {
      const s = summaries.find((x) => x.playerId === p.id);
      return [p.id, Object.fromEntries(RADAR_KEYS.map((k) => [k, s?.stats[k].average ?? null]))];
    }),
  );
  return (
    <>
      <Sub>{t("squad.radar.sub")}</Sub>
      <SquadRadar players={players} values={values} />
    </>
  );
}

/** The in-game "Evaluation Graph": six axes, one shape per player. */
export function SquadRadar({ players, values, className = "h-72 sm:h-80" }: { players: ExplorerPlayer[]; values: Record<string, Partial<Record<SquadStatKey, number | null>>>; className?: string }) {
  const t = useT();
  // Axes have very different ranges (dueling runs ~5× the others), so each axis
  // is scaled to its best value; the tooltip still shows the real points.
  const data = RADAR_KEYS.map((k) => {
    const point: Record<string, string | number | null> = { axis: t(`sqr.${k}` as MessageKey), full: t(`sq.${k}` as MessageKey) };
    const top = Math.max(0, ...players.map((p) => values[p.id]?.[k] ?? 0));
    for (const p of players) {
      const v = values[p.id]?.[k] ?? null;
      point[p.id] = v === null || top <= 0 ? null : Math.round((Math.max(0, v) / top) * 100);
      point[`${p.id}:raw`] = v === null ? null : Math.round(v);
    }
    return point;
  });
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--muted-foreground)", fontSize: 12, fontWeight: 600 }} />
          <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
          <Tooltip
            {...tooltipStyle}
            labelFormatter={(_, payload) => String(payload?.[0]?.payload?.full ?? "")}
            formatter={(value, name, item) => [String(item?.payload?.[`${String(item.dataKey)}:raw`] ?? value ?? "—"), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
          {players.map((p) => (
            <Radar key={p.id} name={p.name} dataKey={p.id} stroke={seatColor(p.seat)} fill={seatColor(p.seat)} fillOpacity={0.18} strokeWidth={2.5} dot={{ r: 3 }} />
          ))}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TrendView({ players, matches }: { players: ExplorerPlayer[]; matches: SquadMatch[] }) {
  const t = useT();
  const [key, setKey] = useState<SquadStatKey>("total_points");
  const data = useMemo(
    () =>
      squadTimeline(matches, players.map((p) => p.id), key).map((pt) => ({ label: pt.label, ...pt.values })),
    [matches, players, key],
  );
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("squad.trend.sub")}</p>
        <select
          aria-label={t("squad.stat")}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={key}
          onChange={(e) => setKey(e.target.value as SquadStatKey)}
        >
          {SQUAD_ROWS.flatMap((r) => r.keys).map((k) => (
            <option key={k} value={k}>
              {t(`sq.${k}` as MessageKey)}
            </option>
          ))}
        </select>
      </div>
      <div className="h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: -12, right: 8, top: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            {players.map((p) => (
              <Line key={p.id} dataKey={p.id} name={p.name} stroke={seatColor(p.seat)} strokeWidth={2.5} dot={{ r: 3.5 }} connectNulls type="monotone" />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function CompareView({ players, summaries }: { players: ExplorerPlayer[]; summaries: SquadPlayerSummary[] }) {
  const t = useT();
  const [group, setGroup] = useState<SquadGroup>("attack");
  const keys = SQUAD_ROWS.filter((r) => r.group === group).flatMap((r) => [...r.keys]);
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {COMPARE_GROUPS.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={group === g}
            onClick={() => setGroup(g)}
            className={cn(
              "h-8 rounded-full border px-3 text-xs font-semibold transition-colors",
              group === g ? "border-foreground bg-accent" : "text-muted-foreground hover:border-foreground/30",
            )}
          >
            {t(`sqg.${g}` as MessageKey)}
          </button>
        ))}
      </div>
      <Sub>{t("squad.compare.sub")}</Sub>
      <div className="grid gap-3 sm:grid-cols-2">
        {keys.map((k) => (
          <MetricBars
            key={k}
            label={t(`sq.${k}` as MessageKey)}
            percent={rowFor(k).format === "pct"}
            items={players.map((p) => ({ player: p, value: summaries.find((s) => s.playerId === p.id)?.stats[k].average ?? null }))}
          />
        ))}
      </div>
    </>
  );
}

interface BarItem {
  player: ExplorerPlayer;
  value: number | null;
}

/** A bar per player from a shared zero baseline; the leader glows. */
export function MetricBars({ label, items, percent = false, note }: { label: string; items: BarItem[]; percent?: boolean; note?: ReactNode }) {
  const values = items.map((i) => i.value);
  const best = leaders(values, false, percent ? 0 : 1);
  const max = percent ? 100 : Math.max(0, ...values.map((v) => v ?? 0));
  const show = (v: number | null) => (percent ? pct(v, 0) : fmt(v, 1));
  return (
    <figure className="rounded-lg border p-3">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2 text-sm font-medium">
        {label}
        {note}
      </figcaption>
      <ul className="space-y-1">
        {items.map((it, i) => {
          const lead = best.includes(i);
          const width = it.value === null || max === 0 ? 0 : (Math.max(0, it.value) / max) * 100;
          return (
            <li
              key={it.player.id}
              className={cn("-mx-1.5 grid grid-cols-[4.75rem_1fr_3.25rem] items-center gap-2 rounded-md px-1.5 py-1", lead && "leader-row")}
              style={lead ? ({ "--glow": seatColor(it.player.seat) } as CSSProperties) : undefined}
            >
              <span className={cn("flex min-w-0 items-center gap-1 text-xs", lead ? "font-semibold" : "text-muted-foreground")}>
                {lead && <Crown className="size-3.5 shrink-0" style={{ color: seatColor(it.player.seat) }} aria-hidden />}
                <span className="truncate">{it.player.name}</span>
              </span>
              <span className={cn("relative", lead ? "h-3" : "h-2")} aria-hidden>
                {it.value !== null && it.value > 0 && (
                  <span
                    className={cn("absolute inset-y-0 left-0 min-w-[2px] overflow-hidden rounded-r-[4px]", lead ? "leader-bar" : "opacity-45")}
                    style={{ width: `${width}%`, background: seatColor(it.player.seat) }}
                  />
                )}
              </span>
              <span className="text-right text-xs tabular">
                {lead ? (
                  <span className="inline-block rounded px-1.5 py-0.5 font-bold" style={{ background: seatColor(it.player.seat), color: "var(--on-seat)" }}>
                    {show(it.value)}
                  </span>
                ) : (
                  show(it.value)
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

function VsView({ players, comparison }: { players: ExplorerPlayer[]; comparison: ModeComparison[] }) {
  const t = useT();
  return (
    <>
      <Sub>{t("squad.vs.sub")}</Sub>
      <div className="mb-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {players.map((p) => {
          const c = comparison.find((x) => x.playerId === p.id);
          return (
            <span key={p.id} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: seatColor(p.seat) }} />
              <strong className="text-foreground">{p.name}</strong> 1v1 {t("squad.games", { n: c?.v1.games ?? 0 })} · 3v3 {t("squad.games", { n: c?.v3.games ?? 0 })}
            </span>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {COMPARE_METRICS.map((m) => (
          <ModePairs key={m} metric={m} players={players} comparison={comparison} />
        ))}
      </div>
    </>
  );
}

const METRIC_LABEL: Record<(typeof COMPARE_METRICS)[number], MessageKey> = {
  goals: "squad.vs.goals",
  shots: "squad.vs.shots",
  accuracy: "squad.vs.accuracy",
  passes: "squad.vs.passes",
  passCompletion: "squad.vs.passCompletion",
  tackles: "squad.vs.tackles",
  interceptions: "squad.vs.interceptions",
};

/** Per player: a solid bar for 1v1 and a hatched bar for 3v3 on one shared scale. */
export function ModePairs({ metric, players, comparison }: { metric: (typeof COMPARE_METRICS)[number]; players: ExplorerPlayer[]; comparison: ModeComparison[] }) {
  const t = useT();
  const percent = PERCENT_METRICS.has(metric);
  const all = comparison.flatMap((c) => [c.v1.values[metric], c.v3.values[metric]]);
  const max = percent ? 100 : Math.max(0, ...all.map((v) => v ?? 0));
  const show = (v: number | null) => (percent ? pct(v, 0) : fmt(v, 1));
  const bar = (v: number | null, seat: number, hatched: boolean) => (
    <span className="relative h-2.5" aria-hidden>
      {v !== null && v > 0 && max > 0 && (
        <span
          className="absolute inset-y-0 left-0 min-w-[2px] rounded-r-[4px]"
          style={{
            width: `${(v / max) * 100}%`,
            background: hatched
              ? `repeating-linear-gradient(135deg, ${seatColor(seat)} 0 4px, color-mix(in oklch, ${seatColor(seat)} 35%, transparent) 4px 7px)`
              : seatColor(seat),
          }}
        />
      )}
    </span>
  );
  return (
    <figure className="rounded-lg border p-3">
      <figcaption className="mb-2 text-sm font-medium">{t(METRIC_LABEL[metric])}</figcaption>
      <ul className="space-y-2">
        {players.map((p) => {
          const c = comparison.find((x) => x.playerId === p.id);
          return (
            <li key={p.id} className="grid grid-cols-[4.5rem_2rem_1fr_3rem] items-center gap-x-2 gap-y-1 text-xs">
              <span className="row-span-2 truncate font-semibold" style={{ color: seatColor(p.seat) }}>
                {p.name}
              </span>
              <span className="text-muted-foreground">{t("squad.vs.mode1v1")}</span>
              {bar(c?.v1.values[metric] ?? null, p.seat, false)}
              <span className="text-right tabular">{show(c?.v1.values[metric] ?? null)}</span>
              <span className="text-muted-foreground">{t("squad.vs.mode3v3")}</span>
              {bar(c?.v3.values[metric] ?? null, p.seat, true)}
              <span className="text-right tabular">{show(c?.v3.values[metric] ?? null)}</span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
