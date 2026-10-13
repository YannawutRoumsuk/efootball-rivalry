import { AlertTriangle, Camera, UserPlus } from "lucide-react";
import Link from "next/link";
import { HeroScoreboard } from "@/components/dashboard/hero-scoreboard";
import { Highlights } from "@/components/dashboard/highlights";
import { InsightsList } from "@/components/dashboard/insights-list";
import { RecentForm } from "@/components/dashboard/recent-form";
import { StatComparison } from "@/components/dashboard/stat-comparison";
import { WinDistribution } from "@/components/dashboard/win-distribution";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { buildInsights } from "@/lib/domain/insights";
import { toPerspectives } from "@/lib/domain/match";
import { recentForm, summarizeRivalry } from "@/lib/domain/stats";
import { asUser, getRivalryContext, loadMatches } from "@/lib/server/context";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = (await getRivalryContext())!;
  const rivalry = ctx.rivalry!;

  if (!ctx.pair) {
    return (
      <EmptyState
        icon={UserPlus}
        title="Player seats are being set up"
        description="Sign out and enter the room code again to finish setting up both players."
      />
    );
  }

  const pair = ctx.pair;
  const all = await asUser(ctx.userId, (tx) => loadMatches(tx, rivalry.id));
  const matches = toPerspectives(all, pair);
  const summary = summarizeRivalry(matches);
  const disputed = all.filter((m) => m.status === "disputed").length;

  if (matches.length === 0) {
    return (
      <div className="space-y-6">
        <HeroScoreboard pair={pair} summary={summary} me={ctx.me} />
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
      <HeroScoreboard pair={pair} summary={summary} me={ctx.me} />
      {disputed > 0 && <DisputedNotice count={disputed} />}
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
