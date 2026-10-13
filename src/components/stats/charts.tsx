"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimelinePoint } from "@/lib/domain/timeline";
import { fmt, pct } from "@/lib/format";

export interface AverageBlock {
  shots: [number | null, number | null];
  onTarget: [number | null, number | null];
  goals: [number | null, number | null];
  accuracy: [number | null, number | null];
  passes: [number | null, number | null];
  successfulPasses: [number | null, number | null];
  passCompletion: [number | null, number | null];
  possession: [number | null, number | null];
}

interface ChartsProps {
  points: TimelinePoint[];
  names: { a: string; b: string };
  averages: AverageBlock;
}

const A = "var(--player-a)";
const B = "var(--player-b)";
const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="var(--border)" vertical={false} />;

function tooltip(format: (v: number) => string = (v) => fmt(v)) {
  return (
    <Tooltip
      cursor={{ stroke: "var(--border)", fill: "oklch(1 0 0 / 0.04)" }}
      contentStyle={{
        background: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        fontSize: 12,
        color: "var(--foreground)",
      }}
      labelStyle={{ color: "var(--muted-foreground)", marginBottom: 4 }}
      formatter={(v) => (typeof v === "number" ? format(v) : String(v ?? "—"))}
    />
  );
}

function ChartCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>
      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
      {footer && <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">{footer}</div>}
    </section>
  );
}

function AvgPair({ label, values, format = (v) => fmt(v) }: { label: string; values: [number | null, number | null]; format?: (v: number | null) => string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}: <strong className="text-player-a">{format(values[0])}</strong> / <strong className="text-player-b">{format(values[1])}</strong>
    </span>
  );
}

export function StatsCharts({ points, names, averages }: ChartsProps) {
  const legend = <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} itemSorter="dataKey" />;
  const dot = points.length > 30 ? false : { r: 2.5 };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Cumulative wins" subtitle="Total wins after each match (totals)">
        <LineChart data={points} margin={{ left: -18, right: 8, top: 4 }}>
          {grid}
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis {...axis} allowDecimals={false} />
          {tooltip()}
          {legend}
          <Line type="stepAfter" dataKey="cumWinsA" name={names.a} stroke={A} strokeWidth={2.5} dot={dot} />
          <Line type="stepAfter" dataKey="cumWinsB" name={names.b} stroke={B} strokeWidth={2.5} dot={dot} />
        </LineChart>
      </ChartCard>

      <ChartCard title="Cumulative goal difference" subtitle="Running goals scored − conceded (totals)">
        <LineChart data={points} margin={{ left: -18, right: 8, top: 4 }}>
          {grid}
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis {...axis} allowDecimals={false} />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
          {tooltip()}
          {legend}
          <Line type="monotone" dataKey="cumGoalDiffA" name={names.a} stroke={A} strokeWidth={2.5} dot={dot} />
          <Line type="monotone" dataKey="cumGoalDiffB" name={names.b} stroke={B} strokeWidth={2.5} dot={dot} />
        </LineChart>
      </ChartCard>

      <ChartCard title="Goals per match" subtitle="Goals scored in each match" footer={<AvgPair label="Average goals" values={averages.goals} />}>
        <BarChart data={points} margin={{ left: -18, right: 8, top: 4 }} barGap={2}>
          {grid}
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis {...axis} allowDecimals={false} />
          {tooltip()}
          {legend}
          <Bar dataKey="goalsA" name={names.a} fill={A} radius={[3, 3, 0, 0]} />
          <Bar dataKey="goalsB" name={names.b} fill={B} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard title="Win rate trend" subtitle="Rolling win % over the last 5 (solid) and 10 (dashed) matches">
        <LineChart data={points} margin={{ left: -18, right: 8, top: 4 }}>
          {grid}
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis {...axis} domain={[0, 100]} unit="%" />
          {tooltip((v) => pct(v))}
          {legend}
          <Line type="monotone" dataKey="rolling5A" name={`${names.a} · last 5`} stroke={A} strokeWidth={2.5} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="rolling5B" name={`${names.b} · last 5`} stroke={B} strokeWidth={2.5} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="rolling10A" name={`${names.a} · last 10`} stroke={A} strokeDasharray="5 4" strokeOpacity={0.7} dot={false} />
          <Line type="monotone" dataKey="rolling10B" name={`${names.b} · last 10`} stroke={B} strokeDasharray="5 4" strokeOpacity={0.7} dot={false} />
        </LineChart>
      </ChartCard>

      <ChartCard title="Possession" subtitle="Possession % per match (gaps = not recorded)" footer={<AvgPair label="Average possession" values={averages.possession} format={(v) => pct(v, 1)} />}>
        <LineChart data={points} margin={{ left: -18, right: 8, top: 4 }}>
          {grid}
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis {...axis} domain={[0, 100]} unit="%" />
          <ReferenceLine y={50} stroke="var(--muted-foreground)" strokeDasharray="3 3" />
          {tooltip((v) => pct(v, 1))}
          {legend}
          <Line type="monotone" dataKey="possessionA" name={names.a} stroke={A} strokeWidth={2.5} dot={dot} />
          <Line type="monotone" dataKey="possessionB" name={names.b} stroke={B} strokeWidth={2.5} dot={dot} />
        </LineChart>
      </ChartCard>

      <ChartCard
        title="Shooting performance"
        subtitle="Per-match averages"
        footer={<AvgPair label="Shot accuracy (on target ÷ shots)" values={averages.accuracy} format={(v) => pct(v, 1)} />}
      >
        <BarChart
          data={[
            { metric: "Shots", a: averages.shots[0], b: averages.shots[1] },
            { metric: "On target", a: averages.onTarget[0], b: averages.onTarget[1] },
            { metric: "Goals", a: averages.goals[0], b: averages.goals[1] },
          ]}
          margin={{ left: -18, right: 8, top: 4 }}
        >
          {grid}
          <XAxis dataKey="metric" {...axis} />
          <YAxis {...axis} />
          {tooltip((v) => fmt(v))}
          {legend}
          <Bar dataKey="a" name={names.a} fill={A} radius={[4, 4, 0, 0]} />
          <Bar dataKey="b" name={names.b} fill={B} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard
        title="Passing performance"
        subtitle="Pass completion % per match"
        footer={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <AvgPair label="Avg passes" values={averages.passes} />
            <AvgPair label="Avg successful" values={averages.successfulPasses} />
            <AvgPair label="Completion" values={averages.passCompletion} format={(v) => pct(v, 1)} />
          </span>
        }
      >
        <LineChart data={points} margin={{ left: -18, right: 8, top: 4 }}>
          {grid}
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis {...axis} domain={[(min: number) => Math.max(0, Math.floor(min / 10) * 10 - 10), 100]} unit="%" />
          {tooltip((v) => pct(v, 1))}
          {legend}
          <Line type="monotone" dataKey="passCompletionA" name={names.a} stroke={A} strokeWidth={2.5} dot={dot} />
          <Line type="monotone" dataKey="passCompletionB" name={names.b} stroke={B} strokeWidth={2.5} dot={dot} />
        </LineChart>
      </ChartCard>

      <ChartCard title="Winning streak timeline" subtitle={`Momentum: bars up = ${names.a} streak, down = ${names.b} streak, 0 = draw`}>
        <BarChart data={points} margin={{ left: -18, right: 8, top: 4 }}>
          {grid}
          <XAxis dataKey="label" {...axis} minTickGap={16} />
          <YAxis {...axis} allowDecimals={false} tickFormatter={(v: number) => String(Math.abs(v))} />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" />
          {tooltip((v) => (v === 0 ? "Draw" : `${Math.abs(v)}-match streak (${v > 0 ? names.a : names.b})`))}
          <Bar dataKey="streak" name="Streak" radius={2}>
            {points.map((p) => (
              <Cell key={p.matchId} fill={p.streak > 0 ? A : p.streak < 0 ? B : "var(--draw)"} />
            ))}
          </Bar>
        </BarChart>
      </ChartCard>
    </div>
  );
}
