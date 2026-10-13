import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { StatsCharts } from "@/components/stats/charts";
import { RangeFilter } from "@/components/stats/range-filter";
import { Button } from "@/components/ui/button";
import { toPerspectives } from "@/lib/domain/match";
import { summarizeRivalry } from "@/lib/domain/stats";
import { applyRange, buildTimeline, parseRange } from "@/lib/domain/timeline";
import { pct } from "@/lib/format";
import { asUser, getRivalryContext, loadMatches } from "@/lib/server/context";

export const metadata = { title: "Advanced statistics" };

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const params = await searchParams;
  const ctx = (await getRivalryContext())!;
  const pair = ctx.pair;
  if (!pair) {
    return <EmptyState icon={BarChart3} title="No stats yet" description="Invite your friend first — charts appear once matches are saved." />;
  }

  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const range = parseRange({ range: str("range"), from: str("from"), to: str("to") });
  const all = toPerspectives(await asUser(ctx.userId, (tx) => loadMatches(tx, ctx.rivalry!.id)), pair);
  const { matches, undatedExcluded } = applyRange(all, range);
  const s = summarizeRivalry(matches);
  const points = buildTimeline(matches);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Advanced statistics"
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
  );
}
