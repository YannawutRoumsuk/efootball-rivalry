import { ChevronLeft, ChevronRight, History, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { HistoryFilters } from "@/components/matches/history-filters";
import { MatchCard } from "@/components/matches/match-card";
import { Button } from "@/components/ui/button";
import { parseHistoryQuery, queryHistory } from "@/lib/domain/history";
import { getT } from "@/lib/i18n/server";
import { asUser, requirePageContext, loadMatches } from "@/lib/server/context";

export async function generateMetadata() {
  return { title: (await getT())("history.title") };
}

export default async function MatchesPage({ searchParams }: PageProps<"/matches">) {
  const params = await searchParams;
  const [ctx, t] = await Promise.all([requirePageContext(), getT()]);
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
        eyebrow={t("history.confirmed", { n: all.filter((m) => m.status === "confirmed").length })}
        title={t("history.title")}
        actions={
          <Button asChild className="h-10">
            <Link href="/upload">
              <Plus /> {t("history.add")}
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
          title={t("history.emptyTitle")}
          description={t("history.emptyBody")}
          action={
            <Button asChild className="h-11">
              <Link href="/upload">{t("history.uploadFirst")}</Link>
            </Button>
          }
        />
      ) : page.items.length === 0 ? (
        <p className="panel px-4 py-10 text-center text-sm text-muted-foreground">{t("history.none")}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {page.total === 1 ? t("common.matchCountOne") : t("common.matchCount", { n: page.total })}
          </p>
          <ul className="grid gap-3 md:grid-cols-2">
            {page.items.map((m) => (
              <li key={m.id}>
                <MatchCard match={m} roster={roster} />
              </li>
            ))}
          </ul>
          {page.pageCount > 1 && (
            <nav className="flex items-center justify-center gap-3" aria-label={t("history.pagination")}>
              <Button asChild variant="outline" className="h-10" aria-disabled={page.page <= 1}>
                <Link href={pageHref(Math.max(1, page.page - 1))} className={page.page <= 1 ? "pointer-events-none opacity-40" : ""}>
                  <ChevronLeft /> {t("history.newer")}
                </Link>
              </Button>
              <span className="text-sm text-muted-foreground tabular">
                {page.page} / {page.pageCount}
              </span>
              <Button asChild variant="outline" className="h-10" aria-disabled={page.page >= page.pageCount}>
                <Link href={pageHref(Math.min(page.pageCount, page.page + 1))} className={page.page >= page.pageCount ? "pointer-events-none opacity-40" : ""}>
                  {t("history.older")} <ChevronRight />
                </Link>
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
