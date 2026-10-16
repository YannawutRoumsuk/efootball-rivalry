import { AlertTriangle, Camera, CalendarRange, UserPlus } from "lucide-react";
import Link from "next/link";
import { HeroScoreboard } from "@/components/dashboard/hero-scoreboard";
import { Highlights } from "@/components/dashboard/highlights";
import { InsightsList } from "@/components/dashboard/insights-list";
import { RecentForm } from "@/components/dashboard/recent-form";
import { StatComparison } from "@/components/dashboard/stat-comparison";
import { WinDistribution } from "@/components/dashboard/win-distribution";
import { PairRecords } from "@/components/league/pair-records";
import { SeasonPicker } from "@/components/league/season-picker";
import { StandingsTable, type RankMode } from "@/components/league/standings-table";
import { EmptyState } from "@/components/layout/empty-state";
import { PairScope } from "@/components/player/seat-scope";
import { Button } from "@/components/ui/button";
import { computeElo } from "@/lib/domain/elo";
import { buildInsights } from "@/lib/domain/insights";
import { computeStandings, matchesBetween, pairFor, pairRecords, resolvePair } from "@/lib/domain/league";
import { toPerspectives } from "@/lib/domain/match";
import { listSeasons, matchesInScope, parseScope, type Scope } from "@/lib/domain/seasons";
import type { PlayerKey } from "@/lib/domain/types";
import { recentForm, summarizeRivalry } from "@/lib/domain/stats";
import { getT } from "@/lib/i18n/server";
import { asUser, requirePageContext, loadMatches } from "@/lib/server/context";
import { hrefWith } from "@/lib/url";

export async function generateMetadata() {
  return { title: (await getT())("dash.title") };
}

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const [ctx, t] = await Promise.all([requirePageContext(), getT()]);
  const rivalry = ctx.rivalry!;
  const roster = ctx.roster;

  if (roster.length < 2) {
    return <EmptyState icon={UserPlus} title={t("dash.noSeats.title")} description={t("dash.noSeats.body")} />;
  }

  const everything = await asUser(ctx.userId, (tx) => loadMatches(tx, rivalry.id));
  const epoch = rivalry.season_epoch;
  const seasons = listSeasons(everything, epoch);
  const scope = parseScope(typeof params.season === "string" ? params.season : undefined, seasons);
  const all = matchesInScope(everything, scope, epoch);
  const mode: RankMode = params.rank === "points" ? "points" : "elo";

  const disputed = all.filter((m) => m.status === "disputed").length;
  const standings = computeStandings(all, roster);
  const elo = computeElo(all, roster.map((p) => p.id)).players;
  const [x, y] = resolvePair(typeof params.pair === "string" ? params.pair : undefined, roster, all, ctx.me?.id ?? null)!;
  const pair = pairFor(roster, x.id, y.id);
  const matches = toPerspectives(matchesBetween(all, x.id, y.id), pair);
  const summary = summarizeRivalry(matches);
  const me: PlayerKey | null = ctx.me?.id === pair.a.id ? "a" : ctx.me?.id === pair.b.id ? "b" : null;

  const href = (patch: Record<string, string | null>) => hrefWith("/", params, patch);
  const seasonHrefs = Object.fromEntries(
    [...seasons.map((s) => s.key), "all"].map((k) => [k, href({ season: k, pair: null })]),
  ) as Record<Scope, string>;
  const header = (
    <>
      <SeasonPicker seasons={seasons} scope={scope} hrefs={seasonHrefs} />
      {scope === "all" && <p className="text-xs text-muted-foreground">{t("season.allNote")}</p>}
      <StandingsTable rows={standings} elo={elo} mode={mode} modeHrefs={{ elo: href({ rank: null }), points: href({ rank: "points" }) }} meId={ctx.me?.id ?? null} />
      {roster.length > 2 && (
        <PairRecords records={pairRecords(all, roster)} selected={`${pair.seats[0]}-${pair.seats[1]}`} hrefFor={(key) => href({ pair: key })} />
      )}
    </>
  );

  if (all.filter((m) => m.status === "confirmed").length === 0) {
    const anyElsewhere = everything.some((m) => m.status === "confirmed");
    const previous = seasons.find((s) => !s.current && everything.some((m) => m.status === "confirmed" && matchesInScope([m], s.key, epoch).length > 0));
    return (
      <div className="space-y-5 sm:space-y-6">
        {header}
        {anyElsewhere ? (
          <EmptyState
            icon={CalendarRange}
            title={t("season.newTitle")}
            description={t("season.newBody")}
            action={
              <>
                {previous && (
                  <Button asChild size="lg" className="h-11 px-5">
                    <Link href={seasonHrefs[previous.key]}>{t("season.viewPrev")}</Link>
                  </Button>
                )}
                <Button asChild size="lg" variant="outline" className="h-11 px-5">
                  <Link href={seasonHrefs.all}>{t("season.viewAll")}</Link>
                </Button>
                <Button asChild size="lg" variant="ghost" className="h-11 px-5">
                  <Link href="/upload">{t("dash.empty.upload")}</Link>
                </Button>
              </>
            }
          />
        ) : (
          <EmptyState
            icon={Camera}
            title={t("dash.empty.title")}
            description={t("dash.empty.body")}
            action={
              <>
                <Button asChild size="lg" className="h-11 px-5">
                  <Link href="/upload">{t("dash.empty.upload")}</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-11 px-5">
                  <Link href="/upload/batch">{t("dash.empty.import")}</Link>
                </Button>
              </>
            }
          />
        )}
        {disputed > 0 && <DisputedNotice text={t("dash.disputed", { n: disputed })} />}
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {header}
      {disputed > 0 && <DisputedNotice text={t("dash.disputed", { n: disputed })} />}
      <PairScope seats={pair.seats}>
        <div id="h2h" className="space-y-5 sm:space-y-6">
          <HeroScoreboard pair={pair} summary={summary} me={me} />
          {matches.length === 0 && (
            <p className="panel px-4 py-6 text-center text-sm text-muted-foreground">
              {t("dash.notPlayed", { a: pair.a.display_name, b: pair.b.display_name })}
            </p>
          )}
          <div className="grid gap-5 sm:gap-6 lg:grid-cols-5">
            <div className="space-y-5 sm:space-y-6 lg:col-span-2">
              <WinDistribution summary={summary} pair={pair} />
              <RecentForm pair={pair} form={{ a: recentForm(matches, "a", 10), b: recentForm(matches, "b", 10) }} />
              <InsightsList insights={buildInsights(summary, matches, pair)} />
            </div>
            <div className="lg:col-span-3">
              <StatComparison summary={summary} pair={pair} />
            </div>
          </div>
          <Highlights summary={summary} pair={pair} />
        </div>
      </PairScope>
    </div>
  );
}

function DisputedNotice({ text }: { text: string }) {
  return (
    <Link
      href="/matches"
      className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm transition-colors hover:bg-warning/15"
    >
      <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
      <span>{text}</span>
    </Link>
  );
}
