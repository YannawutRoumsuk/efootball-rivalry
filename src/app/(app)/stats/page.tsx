import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { PairScope, seatColor } from "@/components/player/seat-scope";
import { StatsCharts } from "@/components/stats/charts";
import { PointsRace } from "@/components/stats/points-race";
import { RangeFilter } from "@/components/stats/range-filter";
import { Button } from "@/components/ui/button";
import { allPairs, matchesBetween, pairFor, pointsTimeline, resolvePair } from "@/lib/domain/league";
import { officialMatches, toPerspectives } from "@/lib/domain/match";
import { summarizeRivalry } from "@/lib/domain/stats";
import { applyRange, buildTimeline, parseRange } from "@/lib/domain/timeline";
import { pct } from "@/lib/format";
import { asUser, requirePageContext, loadMatches } from "@/lib/server/context";

export const metadata = { title: "Advanced statistics" };

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  const roster = ctx.roster;
  if (roster.length < 2) {
    return <EmptyState icon={BarChart3} title="No stats yet" description="At least two players are needed — charts appear once matches are saved." />;
  }

  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const range = parseRange({ range: str("range"), from: str("from"), to: str("to") });
  const everything = await asUser(ctx.userId, (tx) => loadMatches(tx, ctx.rivalry!.id));
  const [x, y] = resolvePair(str("pair"), roster, everything, ctx.me?.id ?? null)!;
  const pair = pairFor(roster, x.id, y.id);
  const all = toPerspectives(matchesBetween(everything, x.id, y.id), pair);
  const { matches, undatedExcluded } = applyRange(all, range);
  const leagueMatches = officialMatches(everything);
  const pairHref = (key: string) => {
    const sp = new URLSearchParams();
    for (const k of ["range", "from", "to"]) if (str(k)) sp.set(k, str(k)!);
    sp.set("pair", key);
    return `/stats?${sp.toString()}`;
  };
  const selectedKey = `${pair.seats[0]}-${pair.seats[1]}`;
  const s = summarizeRivalry(matches);
  const points = buildTimeline(matches);

  return (
    <div className="space-y-6">
      {roster.length > 2 && leagueMatches.length > 0 && (
        <PointsRace points={pointsTimeline(everything, roster)} players={roster.map((p) => ({ seat: p.seat, name: p.display_name }))} />
      )}
      {roster.length > 2 && (
        <nav aria-label="Choose a pair" className="flex flex-wrap gap-2">
          {allPairs(roster).map(([pa, pb]) => {
            const key = `${pa.seat}-${pb.seat}`;
            const active = key === selectedKey;
            return (
              <Link
                key={key}
                href={pairHref(key)}
                scroll={false}
                aria-current={active ? "true" : undefined}
                className={`flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${active ? "border-foreground bg-accent" : "hover:border-foreground/30"}`}
              >
                <span style={{ color: seatColor(pa.seat) }}>{pa.display_name}</span>
                <span className="text-xs font-normal text-muted-foreground">vs</span>
                <span style={{ color: seatColor(pb.seat) }}>{pb.display_name}</span>
              </Link>
            );
          })}
        </nav>
      )}
      <PairScope seats={pair.seats}>
      <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title={roster.length > 2 ? "Head-to-head analytics" : "Advanced statistics"}
        description={
          <>
            {matches.length} confirmed {matches.length === 1 ? "match" : "matches"} in range ·{" "}
            <span className="text-player-a">{pair.a.display_name}</span> {s.a.wins}–{s.draws}–{s.b.wins}{" "}
            <span className="text-player-b">{pair.b.display_name}</span>
          </>
        }
      />
      <Suspense>
        <RangeFilter />
      </Suspense>
      {undatedExcluded > 0 && (
        <p className="text-xs text-muted-foreground">
          {undatedExcluded} {undatedExcluded === 1 ? "match has" : "matches have"} no date and {undatedExcluded === 1 ? "is" : "are"} excluded from date ranges.
        </p>
      )}

      {matches.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Nothing in this range"
          description="Charts are built from confirmed matches only. Try a wider range or upload a match."
          action={
            <Button asChild className="h-11">
              <Link href="/upload">Upload a match</Link>
            </Button>
          }
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Win rate", a: pct(s.a.winRate), b: pct(s.b.winRate) },
              { label: "Shot accuracy", a: pct(s.a.shotAccuracy), b: pct(s.b.shotAccuracy) },
              { label: "Conversion", a: pct(s.a.conversionRate), b: pct(s.b.conversionRate) },
              { label: "Pass completion", a: pct(s.a.passCompletion), b: pct(s.b.passCompletion) },
            ].map((k) => (
              <div key={k.label} className="panel p-3.5">
                <dt className="text-xs text-muted-foreground">{k.label}</dt>
                <dd className="mt-1 flex items-baseline gap-2 font-display text-xl font-bold tabular">
                  <span className="text-player-a">{k.a}</span>
                  <span className="text-sm text-muted-foreground">/</span>
                  <span className="text-player-b">{k.b}</span>
                </dd>
              </div>
            ))}
          </dl>
          <StatsCharts
            points={points}
            names={{ a: pair.a.display_name, b: pair.b.display_name }}
            averages={{
              shots: [s.a.shots.average, s.b.shots.average],
              onTarget: [s.a.shotsOnTarget.average, s.b.shotsOnTarget.average],
              goals: [s.a.avgGoalsFor, s.b.avgGoalsFor],
              accuracy: [s.a.shotAccuracy, s.b.shotAccuracy],
              passes: [s.a.passes.average, s.b.passes.average],
              successfulPasses: [s.a.successfulPasses.average, s.b.successfulPasses.average],
              passCompletion: [s.a.passCompletion, s.b.passCompletion],
              possession: [s.a.possession.average, s.b.possession.average],
            }}
          />
        </>
      )}
      </div>
      </PairScope>
    </div>
  );
}
