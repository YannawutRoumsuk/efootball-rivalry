import { AlertTriangle, Camera, UserPlus } from "lucide-react";
import Link from "next/link";
import { HeroScoreboard } from "@/components/dashboard/hero-scoreboard";
import { Highlights } from "@/components/dashboard/highlights";
import { InsightsList } from "@/components/dashboard/insights-list";
import { RecentForm } from "@/components/dashboard/recent-form";
import { StatComparison } from "@/components/dashboard/stat-comparison";
import { WinDistribution } from "@/components/dashboard/win-distribution";
import { PairRecords } from "@/components/league/pair-records";
import { StandingsTable } from "@/components/league/standings-table";
import { EmptyState } from "@/components/layout/empty-state";
import { PairScope } from "@/components/player/seat-scope";
import { Button } from "@/components/ui/button";
import { buildInsights } from "@/lib/domain/insights";
import { computeStandings, matchesBetween, pairFor, pairRecords, resolvePair } from "@/lib/domain/league";
import { toPerspectives } from "@/lib/domain/match";
import type { PlayerKey } from "@/lib/domain/types";
import { recentForm, summarizeRivalry } from "@/lib/domain/stats";
import { asUser, requirePageContext, loadMatches } from "@/lib/server/context";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  const rivalry = ctx.rivalry!;
  const roster = ctx.roster;

  if (roster.length < 2) {
    return (
      <EmptyState
        icon={UserPlus}
        title="Player seats are being set up"
        description="Set PLAYER_1_PIN and PLAYER_2_PIN (and PLAYER_3_PIN) on the server, then sign in again."
      />
    );
  }

  const all = await asUser(ctx.userId, (tx) => loadMatches(tx, rivalry.id));
  const disputed = all.filter((m) => m.status === "disputed").length;
  const standings = computeStandings(all, roster);
  const [x, y] = resolvePair(typeof params.pair === "string" ? params.pair : undefined, roster, all, ctx.me?.id ?? null)!;
  const pair = pairFor(roster, x.id, y.id);
  const matches = toPerspectives(matchesBetween(all, x.id, y.id), pair);
  const summary = summarizeRivalry(matches);
  const me: PlayerKey | null = ctx.me?.id === pair.a.id ? "a" : ctx.me?.id === pair.b.id ? "b" : null;

  const league = roster.length > 2 && (
    <>
      <StandingsTable rows={standings} meId={ctx.me?.id ?? null} />
      <PairRecords records={pairRecords(all, roster)} selected={`${pair.seats[0]}-${pair.seats[1]}`} basePath="/" />
    </>
  );

  if (all.filter((m) => m.status === "confirmed").length === 0) {
    return (
      <div className="space-y-6">
        {league || (
          <PairScope seats={pair.seats}>
            <HeroScoreboard pair={pair} summary={summary} me={me} />
          </PairScope>
        )}
        <EmptyState
          icon={Camera}
          title="Kick-off: no matches yet"
          description="Upload your first eFootball full-time screenshot. AI reads the score and stats, you confirm who played on which side, and the rivalry begins."
          action={
            <>
              <Button asChild size="lg" className="h-11 px-5">
                <Link href="/upload">Upload a match</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 px-5">
                <Link href="/upload/batch">Import history</Link>
              </Button>
            </>
          }
        />
        {disputed > 0 && <DisputedNotice count={disputed} />}
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {league}
      {disputed > 0 && <DisputedNotice count={disputed} />}
      <PairScope seats={pair.seats}>
      <div id="h2h" className="space-y-5 sm:space-y-6">
      <HeroScoreboard pair={pair} summary={summary} me={me} />
      {matches.length === 0 && (
        <p className="panel px-4 py-6 text-center text-sm text-muted-foreground">
          {pair.a.display_name} and {pair.b.display_name} haven&apos;t played each other yet.
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

function DisputedNotice({ count }: { count: number }) {
  return (
    <Link
      href="/matches"
      className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm transition-colors hover:bg-warning/15"
    >
      <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
      <span>
        {count} disputed {count === 1 ? "match is" : "matches are"} excluded from official stats until resolved.
      </span>
    </Link>
  );
}
