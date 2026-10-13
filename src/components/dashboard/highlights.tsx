import { Crosshair, Flame, Goal, ShieldCheck, Swords, Trophy, TrendingUp, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { RivalrySummary } from "@/lib/domain/stats";
import type { PlayerKey, PlayerPair } from "@/lib/domain/types";
import { pct } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Card {
  id: string;
  icon: LucideIcon;
  title: string;
  value: string;
  who: PlayerKey | null;
  caption: string;
  matchId?: string;
  featured?: boolean;
}

function cards(s: RivalrySummary, pair: PlayerPair): Card[] {
  const name = (k: PlayerKey) => pair[k].display_name;
  const out: Card[] = [];

  if (s.biggestWin) {
    out.push({
      id: "biggest-win",
      icon: Trophy,
      title: "Biggest win",
      value: `${s.biggestWin.goalsFor}–${s.biggestWin.goalsAgainst}`,
      who: s.biggestWin.winner,
      caption: `${name(s.biggestWin.winner)} · match #${s.biggestWin.matchNo}`,
      matchId: s.biggestWin.matchId,
      featured: true,
    });
  }

  const mg = [s.a.mostGoalsInMatch && { k: "a" as const, ...s.a.mostGoalsInMatch }, s.b.mostGoalsInMatch && { k: "b" as const, ...s.b.mostGoalsInMatch }]
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((x, y) => y.goals - x.goals || x.matchNo - y.matchNo)[0];
  if (mg && mg.goals > 0) {
    out.push({ id: "most-goals", icon: Goal, title: "Most goals in a match", value: String(mg.goals), who: mg.k, caption: `${name(mg.k)} · match #${mg.matchNo}`, matchId: mg.matchId });
  }

  const ls: PlayerKey | null = s.a.longestWinStreak === s.b.longestWinStreak ? null : s.a.longestWinStreak > s.b.longestWinStreak ? "a" : "b";
  const lsValue = Math.max(s.a.longestWinStreak, s.b.longestWinStreak);
  if (lsValue > 0) {
    out.push({ id: "longest-streak", icon: TrendingUp, title: "Longest winning streak", value: `${lsValue}`, who: ls, caption: ls ? name(ls) : "Shared record" });
  }

  out.push({
    id: "current-streak",
    icon: Flame,
    title: "Current streak",
    value: s.currentStreak.holder ? `${s.currentStreak.length}` : "—",
    who: s.currentStreak.holder,
    caption: s.currentStreak.holder ? `${name(s.currentStreak.holder)} winning` : "No active streak",
  });

  const cs: PlayerKey | null = s.a.cleanSheets === s.b.cleanSheets ? null : s.a.cleanSheets > s.b.cleanSheets ? "a" : "b";
  out.push({
    id: "clean-sheets",
    icon: ShieldCheck,
    title: "Most clean sheets",
    value: `${Math.max(s.a.cleanSheets, s.b.cleanSheets)}`,
    who: cs,
    caption: cs ? `${name(cs)} · ${s.a.cleanSheets}–${s.b.cleanSheets}` : `Level · ${s.a.cleanSheets} each`,
  });

  if (s.highestScoringMatch) {
    out.push({
      id: "highest-scoring",
      icon: Zap,
      title: "Highest-scoring match",
      value: `${s.highestScoringMatch.totalGoals}`,
      who: null,
      caption: `${s.highestScoringMatch.goalsA}–${s.highestScoringMatch.goalsB} · match #${s.highestScoringMatch.matchNo}`,
      matchId: s.highestScoringMatch.matchId,
    });
  }

  const gdA = s.a.biggestWin?.margin ?? 0;
  const gdB = s.b.biggestWin?.margin ?? 0;
  if (gdA > 0 || gdB > 0) {
    out.push({
      id: "largest-gd",
      icon: Swords,
      title: "Largest goal difference",
      value: `+${Math.max(gdA, gdB)}`,
      who: gdA === gdB ? null : gdA > gdB ? "a" : "b",
      caption: `Best margins: ${name("a")} +${gdA} · ${name("b")} +${gdB}`,
    });
  }

  const acc = [s.a.bestShotAccuracy && { k: "a" as const, ...s.a.bestShotAccuracy }, s.b.bestShotAccuracy && { k: "b" as const, ...s.b.bestShotAccuracy }]
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((x, y) => y.accuracy - x.accuracy || x.matchNo - y.matchNo)[0];
  if (acc) {
    out.push({
      id: "best-accuracy",
      icon: Crosshair,
      title: "Best shot accuracy",
      value: pct(acc.accuracy),
      who: acc.k,
      caption: `${name(acc.k)} · ${acc.onTarget}/${acc.shots} · #${acc.matchNo}`,
      matchId: acc.matchId,
    });
  }
  return out;
}

export function Highlights({ summary, pair }: { summary: RivalrySummary; pair: PlayerPair }) {
  const list = cards(summary, pair);
  return (
    <section aria-labelledby="records-heading">
      <h2 id="records-heading" className="eyebrow mb-3">Rivalry records</h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {list.map((c, i) => {
          const tone = c.who === "a" ? "text-player-a" : c.who === "b" ? "text-player-b" : "text-gold";
          const body = (
            <div
              className={cn(
                "panel group h-full p-4 transition-colors",
                c.matchId && "hover:border-foreground/20",
                c.featured && "bg-gradient-to-br from-gold/12 via-card to-card",
              )}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs leading-snug font-medium text-muted-foreground">{c.title}</p>
                <c.icon className={cn("size-4 shrink-0", c.featured ? "text-gold" : tone)} aria-hidden />
              </div>
              <p className={cn("mt-2 font-display text-3xl font-bold tabular", tone)}>{c.value}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{c.caption}</p>
            </div>
          );
          return (
            <li key={c.id} className="animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
              {c.matchId ? (
                <Link href={`/matches/${c.matchId}`} className="block h-full rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
