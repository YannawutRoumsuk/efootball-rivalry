"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PointsPoint } from "@/lib/domain/league";

interface PointsRaceProps {
  points: PointsPoint[];
  players: Array<{ seat: number; name: string }>;
}

const seatVar = (seat: number) => `var(--seat-${((seat - 1) % 3) + 1})`;

/** Cumulative league points (3 per win, 1 per draw) for every player. */
export function PointsRace({ points, players }: PointsRaceProps) {
  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold">League points race</h2>
      <p className="mb-3 text-xs text-muted-foreground">Cumulative points after each match (totals · W 3, D 1)</p>
      <div className="h-60 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ left: -18, right: 8, top: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--foreground)" }}
              labelStyle={{ color: "var(--muted-foreground)", marginBottom: 4 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
            {players.map((p) => (
              <Line
                key={p.seat}
                type="stepAfter"
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
