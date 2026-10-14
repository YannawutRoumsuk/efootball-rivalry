import { Flame } from "lucide-react";
import { PlayerAvatar } from "@/components/player/player-avatar";
import type { RivalrySummary } from "@/lib/domain/stats";
import type { PlayerKey, PlayerPair } from "@/lib/domain/types";
import type { Translate } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { pct, signed } from "@/lib/format";
import { cn } from "@/lib/utils";

type SeatedPair = PlayerPair & { seats?: [number, number] };

interface HeroScoreboardProps {
  pair: SeatedPair;
  summary: RivalrySummary;
  me: PlayerKey | null;
}

interface PlayerBlockProps extends HeroScoreboardProps {
  k: PlayerKey;
  t: Translate;
}

function PlayerBlock({ pair, k, summary, me, t }: PlayerBlockProps) {
  const p = pair[k];
  const s = summary[k];
  const right = k === "b";
  const stats = [
    { label: t("hero.winPct"), value: pct(s.winRate) },
    { label: t("hero.goals"), value: s.goalsFor },
    { label: t("hero.gd"), value: signed(s.goalDifference) },
  ];
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", right ? "items-end text-right" : "items-start")}>
      <div className={cn("flex min-w-0 items-center gap-3", right && "flex-row-reverse")}>
        <PlayerAvatar name={p.display_name} avatarUrl={p.avatar_url} playerKey={k} size="lg" className="max-sm:size-12 max-sm:text-base" />
        <div className="min-w-0">
          <p className="eyebrow">
            {t("common.player", { n: pair.seats ? pair.seats[k === "a" ? 0 : 1] : k.toUpperCase() })}
            {me === k && ` · ${t("common.you")}`}
          </p>
          <p className="truncate text-lg font-semibold sm:text-2xl">{p.display_name}</p>
        </div>
      </div>
      <dl className={cn("grid grid-cols-3 gap-x-4 gap-y-1 text-sm sm:gap-x-6", right && "text-right")}>
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="text-base font-semibold tabular sm:text-lg">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Head-to-head scoreboard for the selected pair. */
export async function HeroScoreboard({ pair, summary, me }: HeroScoreboardProps) {
  const t = await getT();
  const { a, b, draws, totalMatches, currentStreak } = summary;
  const leader: PlayerKey | null = a.wins === b.wins ? null : a.wins > b.wins ? "a" : "b";

  return (
    <section aria-labelledby="h2h-heading" className="panel overflow-hidden">
      <div className="flex h-1" aria-hidden>
        <span className="flex-1 bg-player-a" />
        <span className="flex-1 bg-player-b" />
      </div>
      <div className="px-4 pt-4 pb-6 sm:px-8 sm:pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="h2h-heading" className="text-sm font-semibold">
            {t("hero.title")}
          </h2>
          <p className="eyebrow tabular">{totalMatches === 1 ? t("common.matchCountOne") : t("common.matchCount", { n: totalMatches })}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-8">
          <PlayerBlock pair={pair} k="a" summary={summary} me={me} t={t} />

          <div className="order-first col-span-2 flex items-end justify-center gap-4 sm:order-none sm:col-span-1 sm:gap-6">
            <ScoreNumber value={a.wins} label={t("hero.wins")} k="a" dim={leader === "b"} />
            <div className="flex flex-col items-center pb-1">
              <span className="text-3xl font-semibold text-draw tabular sm:text-4xl">{draws}</span>
              <span className="text-xs text-muted-foreground">{t("hero.draws")}</span>
            </div>
            <ScoreNumber value={b.wins} label={t("hero.wins")} k="b" dim={leader === "a"} />
          </div>

          <PlayerBlock pair={pair} k="b" summary={summary} me={me} t={t} />
        </div>

        {currentStreak.holder && currentStreak.length >= 2 && (
          <p className="mt-5 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Flame className={cn("size-4", currentStreak.holder === "a" ? "text-player-a" : "text-player-b")} aria-hidden />
            {t("hero.streak", { name: pair[currentStreak.holder].display_name, n: currentStreak.length })}
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
          "text-6xl leading-none font-bold tabular sm:text-7xl",
          k === "a" ? "text-player-a" : "text-player-b",
          dim && "opacity-60",
        )}
      >
        {value}
      </span>
      <span className="mt-1 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
