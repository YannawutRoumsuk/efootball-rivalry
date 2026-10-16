"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PointsPoint } from "@/lib/domain/league";
import { useT } from "@/lib/i18n/client";

interface PointsRaceProps {
  points: PointsPoint[];
  players: Array<{ seat: number; name: string }>;
  /** "points" = league points race, "elo" = rating after each match. */
  kind?: "points" | "elo";
}

const seatVar = (seat: number) => `var(--seat-${((seat - 1) % 3) + 1})`;

/** One line per player: cumulative league points, or Elo rating, after each match. */
export function PointsRace({ points, players, kind = "points" }: PointsRaceProps) {
  const t = useT();
  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="text-sm font-semibold">{t(kind === "elo" ? "chart.elo.title" : "chart.points.title")}</h2>
      <p className="mb-3 text-xs text-muted-foreground">{t(kind === "elo" ? "chart.elo.sub" : "chart.points.sub")}</p>
      <div className="h-60 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ left: -18, right: 8, top: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} domain={kind === "elo" ? ["auto", "auto"] : [0, "auto"]} />
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--foreground)" }}
              labelStyle={{ color: "var(--muted-foreground)", marginBottom: 4 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            {players.map((p) => (
              <Line
                key={p.seat}
                type={kind === "elo" ? "monotone" : "stepAfter"}
                dataKey={`p${p.seat}`}
                name={p.name}
                stroke={seatVar(p.seat)}
                strokeWidth={2.5}
                dot={points.length > 30 ? false : { r: 2.5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
