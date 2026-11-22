import { Crown, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { seatColor } from "@/components/player/seat-scope";
import { ModePairs, SquadRadar } from "@/components/squad/squad-explorer";
import { SquadInsights } from "@/components/squad/squad-insights";
import { AwardChip, tallyAwards } from "@/components/squad/award-chip";
import { computeElo } from "@/lib/domain/elo";
import { officialMatches, winnerPlayerId } from "@/lib/domain/match";
import { playerBoard } from "@/lib/domain/player-stats";
import { matchesInScope, listSeasons, parseScope } from "@/lib/domain/seasons";
import { RADAR_KEYS, summarizeSquadPlayer } from "@/lib/domain/squad";
import { COMPARE_METRICS, compareModes } from "@/lib/domain/squad-compare";
import { fmt, formatMatchDate, pct } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { asUser, isUuid, loadMatches, requirePageContext } from "@/lib/server/context";
import { loadSquadMatches } from "@/lib/server/squad";

export async function generateMetadata() {
  return { title: (await getT())("profile.title") };
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="panel p-3.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-bold tabular" style={accent ? { color: accent } : undefined}>
        {value}
      </dd>
    </div>
  );
}

export default async function PlayerProfilePage({ params }: PageProps<"/players/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [ctx, t, locale] = await Promise.all([requirePageContext(), getT(), getLocale()]);
  const player = ctx.roster.find((p) => p.id === id);
  if (!player) notFound();
  const { stored, squad } = await asUser(ctx.userId, async (tx) => ({
    stored: await loadMatches(tx, ctx.rivalry.id),
    squad: await loadSquadMatches(tx, ctx.rivalry.id),
  }));
  const color = seatColor(player.seat);
  const ids = ctx.roster.map((p) => p.id);

  // 1v1: Elo for the current season (as on the stats page), everything else career-long.
  const epoch = ctx.rivalry.season_epoch;
  const season = matchesInScope(stored, parseScope(undefined, listSeasons(stored, epoch)), epoch);
  const elo = computeElo(season, ids).players;
  const ranking = [...elo.entries()].filter(([, e]) => e.games > 0).sort((a, b) => b[1].rating - a[1].rating);
  const rank = ranking.findIndex(([pid]) => pid === id) + 1;
  const myElo = elo.get(id);
  const board = playerBoard(stored, ctx.roster);
  const row = board.find((r) => r.player.id === id)!;
  const official = officialMatches(stored);
  const h2h = ctx.roster
    .filter((p) => p.id !== id)
    .map((opp) => {
      const games = official.filter((m) => m.sides.some((s) => s.player_id === id) && m.sides.some((s) => s.player_id === opp.id));
      const w = games.filter((m) => winnerPlayerId(m) === id).length;
      const l = games.filter((m) => winnerPlayerId(m) === opp.id).length;
      return { opp, games: games.length, w, d: games.length - w - l, l };
    });

  // 3v3
  const summaries = ctx.roster.map((p) => summarizeSquadPlayer(squad, p.id));
  const mine = summaries.find((s) => s.playerId === id)!;
  const others = summaries.filter((s) => s.playerId !== id && s.games > 0);
  const teamAvg = Object.fromEntries(
    RADAR_KEYS.map((k) => {
      const vals = others.map((o) => o.stats[k].average).filter((v): v is number => v !== null);
      return [k, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null];
    }),
  );
  const myLines = squad
    .map((m) => ({ m, p: m.players.find((x) => x.player_id === id) }))
    .filter((x) => x.p && x.p.stats.total_points != null);
  const best = myLines.sort((a, b) => b.p!.stats.total_points! - a.p!.stats.total_points!)[0];
  const squadPlayers = ctx.roster
    .filter((p) => summaries.find((s) => s.playerId === p.id)!.games > 0)
    .map((p) => ({ id: p.id, name: p.display_name, seat: p.seat }));
  const comparison = compareModes([id], board, summaries);
  const titles = tallyAwards(squad.map((m) => m.players.find((x) => x.player_id === id)?.awards));
  const radarPlayers = [
    { id, name: player.display_name, seat: player.seat },
    ...(others.length ? [{ id: "team", name: t("squad.team"), seat: 0 }] : []),
  ];

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-2xl border p-5 sm:p-7" style={{ background: `linear-gradient(135deg, color-mix(in oklch, ${color} 22%, var(--card)), var(--card) 65%)` }}>
        <p className="eyebrow mb-1.5">{t("profile.eyebrow")}</p>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl" style={{ color }}>
            {player.display_name}
          </h1>
          {myElo && myElo.games > 0 && (
            <p className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular">{Math.round(myElo.rating)}</span>
              <span className="text-sm text-muted-foreground">{t("profile.elo")}</span>
              {rank > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: color, color: "var(--on-seat)" }}>
                  {rank === 1 && <Trophy className="size-3" aria-hidden />}
                  {t("profile.rank", { n: rank })}
                </span>
              )}
            </p>
          )}
        </div>
        <nav className="mt-4 flex flex-wrap gap-2 text-sm">
          {ctx.roster.map((p) => (
            <Link
              key={p.id}
              href={`/players/${p.id}`}
              aria-current={p.id === id ? "page" : undefined}
              className="rounded-full border px-3 py-1 font-semibold transition-colors hover:bg-accent aria-[current=page]:bg-background"
              style={{ color: seatColor(p.seat) }}
            >
              {p.display_name}
            </Link>
          ))}
        </nav>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t("profile.section.1v1")}</h2>
        {row.games === 0 ? (
          <p className="text-sm text-muted-foreground">{t("profile.no1v1")}</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Kpi label={t("squad.kpi.matches")} value={String(row.games)} />
              <Kpi label={t("profile.record")} value={`${row.wins}–${row.draws}–${row.losses}`} />
              <Kpi label={t("profile.winRate")} value={pct(row.winRate, 0)} accent={color} />
              <Kpi label={t("profile.goalsPer")} value={fmt(row.goalsFor.average, 1)} />
              <Kpi label={t("profile.concededPer")} value={fmt(row.goalsAgainst.average, 1)} />
              <Kpi label={t("profile.cleanSheets")} value={String(row.cleanSheets)} />
            </dl>
            <h3 className="pt-2 text-sm font-semibold">{t("profile.section.h2h")}</h3>
            <ul className="grid gap-3 sm:grid-cols-2">
              {h2h.map(({ opp, games, w, d, l }) => (
                <li key={opp.id} className="panel flex items-center gap-3 p-3.5">
                  <span className="text-sm">
                    {t("profile.vs", { name: "" })}
                    <strong style={{ color: seatColor(opp.seat) }}>{opp.display_name}</strong>
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">{t("common.matchCount", { n: games })}</span>
                  <span className="text-lg font-bold tabular">
                    <span style={{ color }}>{w}</span>–{d}–<span style={{ color: seatColor(opp.seat) }}>{l}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">{t("profile.section.3v3")}</h2>
        {mine.games === 0 ? (
          <p className="text-sm text-muted-foreground">{t("profile.no3v3")}</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Kpi label={t("squad.kpi.matches")} value={String(mine.games)} />
              <Kpi label={t("profile.record")} value={`${mine.wins}–${mine.draws}–${mine.losses}`} />
              <Kpi label={t("profile.avgPoints")} value={fmt(mine.stats.total_points.average, 0)} accent={color} />
              <Kpi label={t("profile.mvps")} value={String(mine.mvps)} />
              <Kpi label="G+A" value={`${mine.stats.goals.total}+${mine.stats.assists.total}`} />
            </dl>
            {titles.length > 0 && (
              <section className="panel p-4">
                <h3 className="mb-2 text-sm font-semibold">{t("squad.awards.title")}</h3>
                <ul className="flex flex-wrap gap-2">
                  {titles.map((a) => (
                    <li key={`${a.title}|${a.tier}`} className="inline-flex items-center gap-1">
                      <AwardChip award={a} />
                      {a.count > 1 && <span className="text-xs font-semibold text-muted-foreground tabular">×{a.count}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="panel p-4" style={{ "--seat-0": "var(--muted-foreground)" } as CSSProperties}>
                <SquadRadar players={radarPlayers} values={{ [id]: mine.stats ? Object.fromEntries(RADAR_KEYS.map((k) => [k, mine.stats[k].average])) : {}, team: teamAvg }} className="h-72" />
              </section>
              <div className="space-y-4">
                {best && (
                  <Link href={`/squad/${best.m.id}`} className="panel block p-4 transition-colors hover:border-foreground/25">
                    <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                      <Crown className="size-4" style={{ color }} aria-hidden /> {t("profile.best3v3")}
                    </h3>
                    <p className="text-2xl font-black tabular" style={{ color }}>
                      {t("profile.points", { n: best.p!.stats.total_points! })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {best.m.team_name ?? t("squad.match")} · {formatMatchDate(best.m.played_at ?? best.m.created_at, locale)}
                    </p>
                  </Link>
                )}
              </div>
            </div>
            <section className="panel space-y-3 p-4 sm:p-5">
              <div>
                <h3 className="text-sm font-semibold">{t("squad.ins.title")}</h3>
                <p className="text-xs text-muted-foreground">{t("squad.ins.sub")}</p>
              </div>
              <SquadInsights players={squadPlayers} summaries={summaries} onlyId={id} />
            </section>
          </>
        )}
      </section>

      {(row.games > 0 || mine.games > 0) && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">{t("squad.tab.vs1v1")}</h2>
          <p className="text-xs text-muted-foreground">{t("squad.vs.sub")}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {COMPARE_METRICS.map((m) => (
              <ModePairs key={m} metric={m} players={[{ id, name: player.display_name, seat: player.seat }]} comparison={comparison} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
