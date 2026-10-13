import { Trophy } from "lucide-react";
import { PlayerAvatar } from "@/components/player/player-avatar";
import { seatColor, seatStyle } from "@/components/player/seat-scope";
import type { StandingRow } from "@/lib/domain/league";
import type { Outcome } from "@/lib/domain/types";
import { signed } from "@/lib/format";
import { cn } from "@/lib/utils";

function FormDots({ form, seat }: { form: Outcome[]; seat: number }) {
  return (
    <ol className="flex gap-1" aria-label="Last five results">
      {form.map((o, i) => (
        <li
          key={i}
          title={o === "W" ? "Win" : o === "D" ? "Draw" : "Loss"}
          className={cn(
            "flex size-5 items-center justify-center rounded text-[0.6rem] font-bold",
            o === "D" && "bg-draw/25 text-draw",
            o === "L" && "border border-border text-muted-foreground",
          )}
          style={o === "W" ? { background: seatColor(seat), color: "var(--primary-foreground)" } : undefined}
        >
          {o}
        </li>
      ))}
    </ol>
  );
}

/** League table: 3 points per win, 1 per draw. */
export function StandingsTable({ rows, meId }: { rows: StandingRow[]; meId: string | null }) {
  const anyPlayed = rows.some((r) => r.played > 0);
  return (
    <section aria-labelledby="standings-heading" className="panel overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-seat-1 via-seat-2 to-seat-3" />
      <div className="flex items-center justify-between px-4 pt-4 sm:px-6 sm:pt-5">
        <h2 id="standings-heading" className="eyebrow">League table</h2>
        <span className="text-xs text-muted-foreground">W 3 · D 1 · L 0</span>
      </div>
      <div className="overflow-x-auto">
        <table className="mt-2 w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="text-[0.68rem] tracking-wider text-muted-foreground uppercase">
              <th scope="col" className="w-8 py-2 pl-4 text-left font-medium sm:pl-6">#</th>
              <th scope="col" className="py-2 text-left font-medium">Player</th>
              <th scope="col" className="py-2 text-center font-medium">P</th>
              <th scope="col" className="hidden py-2 text-center font-medium sm:table-cell">W</th>
              <th scope="col" className="hidden py-2 text-center font-medium sm:table-cell">D</th>
              <th scope="col" className="hidden py-2 text-center font-medium sm:table-cell">L</th>
              <th scope="col" className="py-2 text-center font-medium">GD</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium sm:pr-6">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const leader = anyPlayed && i === 0;
              return (
                <tr key={r.player.id} className="border-t" style={seatStyle(r.player.seat)}>
                  <td className="py-3 pl-4 font-display font-bold text-muted-foreground tabular sm:pl-6">
                    {leader ? <Trophy className="size-4 text-gold" aria-label="Leader" /> : i + 1}
                  </td>
                  <td className="py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <PlayerAvatar name={r.player.display_name} avatarUrl={r.player.avatar_url} playerKey="a" size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold" style={{ color: seatColor(r.player.seat) }}>
                          {r.player.display_name}
                          {r.player.id === meId && <span className="ml-1.5 text-xs font-normal text-muted-foreground">you</span>}
                        </p>
                        {r.form.length > 0 && (
                          <div className="mt-1">
                            <FormDots form={r.form} seat={r.player.seat} />
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-center tabular">{r.played}</td>
                  <td className="hidden py-3 text-center tabular sm:table-cell">{r.wins}</td>
                  <td className="hidden py-3 text-center tabular sm:table-cell">{r.draws}</td>
                  <td className="hidden py-3 text-center tabular sm:table-cell">{r.losses}</td>
                  <td className="py-3 text-center tabular">{signed(r.goalDiff)}</td>
                  <td className="py-3 pr-4 text-right font-display text-xl font-bold tabular sm:pr-6" style={{ color: seatColor(r.player.seat) }}>
                    {r.points}
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
