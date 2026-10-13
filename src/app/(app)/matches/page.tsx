import { ChevronLeft, ChevronRight, History, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { HistoryFilters } from "@/components/matches/history-filters";
import { MatchCard } from "@/components/matches/match-card";
import { Button } from "@/components/ui/button";
import { parseHistoryQuery, queryHistory } from "@/lib/domain/history";
import { asUser, requirePageContext, loadMatches } from "@/lib/server/context";

export const metadata = { title: "Match history" };

export default async function MatchesPage({ searchParams }: PageProps<"/matches">) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  const roster = ctx.roster;

  const all = await asUser(ctx.userId, (tx) => loadMatches(tx, ctx.rivalry!.id));
  const query = parseHistoryQuery(params);
  const page = queryHistory(all, roster, query);

  const pageHref = (n: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string" && k !== "page") sp.set(k, v);
    if (n > 1) sp.set("page", String(n));
    const qs = sp.toString();
    return qs ? `/matches?${qs}` : "/matches";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${all.filter((m) => m.status === "confirmed").length} confirmed`}
        title="Match history"
        actions={
          <Button asChild className="h-10">
            <Link href="/upload">
              <Plus /> Add match
            </Link>
          </Button>
        }
      />
      <Suspense>
        <HistoryFilters players={roster.map((p) => ({ seat: p.seat, name: p.display_name }))} />
      </Suspense>

      {all.length === 0 ? (
        <EmptyState
          icon={History}
          title="No matches recorded"
          description="Your rivalry history will appear here after the first upload."
          action={
            <Button asChild className="h-11">
              <Link href="/upload">Upload first match</Link>
            </Button>
          }
        />
      ) : page.items.length === 0 ? (
        <p className="panel px-4 py-10 text-center text-sm text-muted-foreground">No matches match these filters.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {page.total} {page.total === 1 ? "match" : "matches"}
          </p>
          <ul className="grid gap-3 md:grid-cols-2">
            {page.items.map((m) => (
              <li key={m.id}>
                <MatchCard match={m} roster={roster} />
              </li>
            ))}
          </ul>
          {page.pageCount > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label="Pagination">
              <Button asChild variant="outline" className="h-10" aria-disabled={page.page <= 1}>
                <Link href={pageHref(Math.max(1, page.page - 1))} className={page.page <= 1 ? "pointer-events-none opacity-40" : ""}>
                  <ChevronLeft /> Newer
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground tabular">
                {page.page} / {page.pageCount}
              </span>
              <Button asChild variant="outline" className="h-10" aria-disabled={page.page >= page.pageCount}>
                <Link href={pageHref(Math.min(page.pageCount, page.page + 1))} className={page.page >= page.pageCount ? "pointer-events-none opacity-40" : ""}>
                  Older <ChevronRight />
                </Link>
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
