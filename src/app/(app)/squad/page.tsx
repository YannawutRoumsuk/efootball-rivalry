import { Crown, Upload, UsersRound } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { seatColor } from "@/components/player/seat-scope";
import { AliasManager } from "@/components/squad/alias-manager";
import { SquadExplorer } from "@/components/squad/squad-explorer";
import { SquadMatchCard } from "@/components/squad/squad-match-card";
import { Button } from "@/components/ui/button";
import { playerBoard } from "@/lib/domain/player-stats";
import { squadOutcome, summarizeSquadPlayer } from "@/lib/domain/squad";
import { compareModes } from "@/lib/domain/squad-compare";
import { fmt } from "@/lib/format";
import { getLocale, getT } from "@/lib/i18n/server";
import { asUser, loadMatches, requirePageContext } from "@/lib/server/context";
import { loadSquadMatches } from "@/lib/server/squad";

export async function generateMetadata() {
  return { title: (await getT())("squad.title") };
}

export default async function SquadPage() {
  const [ctx, t, locale] = await Promise.all([requirePageContext(), getT(), getLocale()]);
  const { matches, oneVsOne, aliases } = await asUser(ctx.userId, async (tx) => ({
    matches: await loadSquadMatches(tx, ctx.rivalry.id),
    oneVsOne: await loadMatches(tx, ctx.rivalry.id),
    aliases: await tx<Array<{ name: string; playerId: string }>>`
      select ingame_name as name, player_id as "playerId" from public.squad_aliases
      where rivalry_id = ${ctx.rivalry.id} order by ingame_name`,
  }));
  const canEdit = ctx.me?.seat === 1;
  const upload = (
    <Button asChild className="h-10">
      <Link href="/squad/upload">
        <Upload className="size-4" aria-hidden />
        {t("squad.upload")}
      </Link>
    </Button>
  );

  if (matches.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t("squad.eyebrow")} title={t("squad.title")} description={t("squad.subtitle")} />
        <EmptyState icon={UsersRound} title={t("squad.empty.title")} description={t("squad.empty.body")} action={upload} />
      </div>
    );
  }

  const summaries = ctx.roster.map((p) => summarizeSquadPlayer(matches, p.id));
  const active = ctx.roster.filter((p) => summaries.find((s) => s.playerId === p.id)!.games > 0);
  const players = active.map((p) => ({ id: p.id, name: p.display_name, seat: p.seat }));
  const comparison = compareModes(active.map((p) => p.id), playerBoard(oneVsOne, ctx.roster), summaries);
  const outcomes = matches.map(squadOutcome);
  const [w, d, l] = (["W", "D", "L"] as const).map((o) => outcomes.filter((x) => x === o).length);
  const scored = matches.filter((m) => m.goals_for !== null && m.goals_against !== null);
  const gf = scored.reduce((n, m) => n + m.goals_for!, 0);
  const ga = scored.reduce((n, m) => n + m.goals_against!, 0);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("squad.eyebrow")} title={t("squad.title")} description={t("squad.subtitle")} actions={upload} />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="panel p-3.5">
          <dt className="text-xs text-muted-foreground">{t("squad.kpi.matches")}</dt>
          <dd className="mt-1 text-2xl font-bold tabular">{matches.length}</dd>
        </div>
        <div className="panel p-3.5">
          <dt className="text-xs text-muted-foreground">{t("squad.kpi.record")}</dt>
          <dd className="mt-1 text-2xl font-bold tabular">
            <span className="text-emerald-600 dark:text-emerald-400">{w}</span>–{d}–<span className="text-red-600 dark:text-red-400">{l}</span>
          </dd>
        </div>
        <div className="panel col-span-2 p-3.5 sm:col-span-1">
          <dt className="text-xs text-muted-foreground">{t("squad.kpi.goals")}</dt>
          <dd className="mt-1 text-2xl font-bold tabular">
            {gf}–{ga}
          </dd>
        </div>
      </dl>

      <ul className="grid gap-3 sm:grid-cols-3">
        {active.map((p) => {
          const s = summaries.find((x) => x.playerId === p.id)!;
          return (
            <li key={p.id}>
              <Link
                href={`/players/${p.id}`}
                className="panel group relative block overflow-hidden p-4 transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="absolute inset-x-0 top-0 h-1" style={{ background: seatColor(p.seat) }} aria-hidden />
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-lg font-bold" style={{ color: seatColor(p.seat) }}>
                    {p.display_name}
                  </span>
                  {s.mvps > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: seatColor(p.seat), color: "var(--on-seat)" }}>
                      <Crown className="size-3" aria-hidden />
                      {t("squad.mvpCount", { n: s.mvps })}
                    </span>
                  )}
                </span>
                <span className="mt-2 block text-3xl font-black tabular">{fmt(s.stats.total_points.average, 0)}</span>
                <span className="block text-xs text-muted-foreground">{t("squad.kpi.avgPoints")}</span>
                <span className="mt-2 flex gap-3 text-xs text-muted-foreground tabular">
                  <span>{t("squad.games", { n: s.games })}</span>
                  <span>{t("squad.ga", { n: s.goalContributions })}</span>
                  <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">{t("profile.view")} →</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <SquadExplorer players={players} summaries={summaries} matches={matches} comparison={comparison} />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t("squad.matches")}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {matches.map((m) => (
            <SquadMatchCard key={m.id} match={m} roster={ctx.roster} t={t} locale={locale} />
          ))}
        </div>
      </section>

      <AliasManager aliases={aliases} roster={ctx.roster} canEdit={canEdit} />
    </div>
  );
}
