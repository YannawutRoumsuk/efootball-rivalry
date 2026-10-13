import { Flame } from "lucide-react";
import { PlayerAvatar } from "@/components/player/player-avatar";
import type { RivalrySummary } from "@/lib/domain/stats";
import type { PlayerKey, PlayerPair } from "@/lib/domain/types";
import { pct, signed } from "@/lib/format";
import { cn } from "@/lib/utils";

interface HeroScoreboardProps {
  pair: PlayerPair;
  summary: RivalrySummary;
  me: PlayerKey | null;
}

function PlayerBlock({ pair, k, summary, me }: { pair: PlayerPair; k: PlayerKey; summary: RivalrySummary; me: PlayerKey | null }) {
  const p = pair[k];
  const s = summary[k];
  const right = k === "b";
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", right ? "items-end text-right" : "items-start")}>
      <div className={cn("flex min-w-0 items-center gap-3", right && "flex-row-reverse")}>
        <PlayerAvatar name={p.display_name} avatarUrl={p.avatar_url} playerKey={k} size="lg" className="max-sm:size-12 max-sm:text-base" />
        <div className="min-w-0">
          <p className={cn("eyebrow", k === "a" ? "text-player-a" : "text-player-b")}>
            Player {k.toUpperCase()}
            {me === k && <span className="text-muted-foreground"> · You</span>}
          </p>
          <p className="truncate font-display text-lg font-bold sm:text-2xl">{p.display_name}</p>
        </div>
      </div>
      <dl className={cn("grid grid-cols-3 gap-x-4 gap-y-1 text-sm sm:gap-x-6", right && "text-right")}>
        <div>
          <dt className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">Win%</dt>
          <dd className="font-display text-base font-semibold tabular sm:text-xl">{pct(s.winRate)}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">Goals</dt>
          <dd className="font-display text-base font-semibold tabular sm:text-xl">{s.goalsFor}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">GD</dt>
          <dd className="font-display text-base font-semibold tabular sm:text-xl">{signed(s.goalDifference)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Broadcast-style head-to-head scoreboard. */
export function HeroScoreboard({ pair, summary, me }: HeroScoreboardProps) {
  const { a, b, draws, totalMatches, currentStreak } = summary;
  const leader: PlayerKey | null = a.wins === b.wins ? null : a.wins > b.wins ? "a" : "b";

  return (
    <section aria-labelledby="h2h-heading" className="panel animate-rise overflow-hidden">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-player-a/18 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-player-b/18 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-player-a via-transparent to-player-b" />

      <div className="relative px-4 pt-5 pb-6 sm:px-8 sm:pt-7">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="h2h-heading" className="eyebrow">Head to head</h2>
          <p className="eyebrow tabular">
            {totalMatches} {totalMatches === 1 ? "match" : "matches"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-8">
          <PlayerBlock pair={pair} k="a" summary={summary} me={me} />

          <div className="order-first col-span-2 flex items-end justify-center gap-3 sm:order-none sm:col-span-1 sm:gap-5">
            <ScoreNumber value={a.wins} label="Wins" k="a" dim={leader === "b"} />
            <div className="flex flex-col items-center pb-1">
              <span className="font-display text-3xl font-bold text-draw tabular sm:text-4xl">{draws}</span>
              <span className="text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">Draws</span>
            </div>
            <ScoreNumber value={b.wins} label="Wins" k="b" dim={leader === "a"} />
          </div>

          <PlayerBlock pair={pair} k="b" summary={summary} me={me} />
        </div>

        {currentStreak.holder && currentStreak.length >= 2 && (
          <p className="mt-5 flex items-center justify-center gap-2 text-sm">
            <Flame className={cn("size-4", currentStreak.holder === "a" ? "text-player-a" : "text-player-b")} aria-hidden />
            <span>
              <strong className={currentStreak.holder === "a" ? "text-player-a" : "text-player-b"}>
                {pair[currentStreak.holder].display_name}
              </strong>{" "}
              is on a {currentStreak.length}-match winning streak
            </span>
          </p>
        )}
      </div>
    </section>
  );
}

function ScoreNumber({ value, label, k, dim }: { value: number; label: string; k: PlayerKey; dim: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={cn(
          "font-display text-7xl leading-none font-bold tabular transition-opacity sm:text-8xl",
          k === "a" ? "text-player-a" : "text-player-b",
          dim && "opacity-55",
        )}
        style={{ textShadow: `0 0 40px var(--player-${k})` }}
      >
        {value}
      </span>
      <span className="mt-1 text-[0.65rem] tracking-[0.2em] text-muted-foreground uppercase">{label}</span>
    </div>
  );
}
