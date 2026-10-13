import { ArrowLeft, CalendarDays, History, ImageOff, Upload } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchActions } from "@/components/matches/match-actions";
import { SideBySideStats } from "@/components/matches/side-by-side-stats";
import { StatusBadge } from "@/components/matches/status-badge";
import { ScreenshotViewer } from "@/components/upload/screenshot-viewer";
import { sideOnScreen, toPerspective } from "@/lib/domain/match";
import type { PlayerKey } from "@/lib/domain/types";
import { formatMatchDate, formatTimestamp } from "@/lib/format";
import { asUser, getRivalryContext, isUuid, loadMatch } from "@/lib/server/context";
import { screenshotUrl } from "@/lib/server/storage";
import { cn } from "@/lib/utils";

export const metadata = { title: "Match" };

interface MatchEvent {
  id: string;
  event_type: string;
  actor_id: string | null;
  note: string | null;
  created_at: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
}

const EVENT_LABEL: Record<string, string> = {
  created: "saved the match",
  updated: "corrected the match",
  disputed: "disputed the result",
  resolved: "resolved the dispute",
  voided: "voided the match",
  restored: "restored the match",
  reordered: "changed the match order",
};

export default async function MatchDetailPage({ params }: PageProps<"/matches/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = (await getRivalryContext())!;
  const pair = ctx.pair;
  if (!pair || !ctx.me) notFound();

  const data = await asUser(ctx.userId, async (tx) => {
    const match = await loadMatch(tx, id);
    if (!match) return null;
    const [upload] = await tx<Array<{ id: string }>>`
      select id from public.match_uploads where match_id = ${id} order by created_at limit 1`;
    const events = await tx<MatchEvent[]>`
      select id, event_type, actor_id, note, created_at::text as created_at, before_data, after_data
      from public.match_events where match_id = ${id} order by created_at desc`;
    const [max] = await tx<Array<{ match_no: number }>>`
      select max(match_no)::int as match_no from public.matches where rivalry_id = ${ctx.rivalry!.id}`;
    return { match, upload, events, maxNo: max?.match_no ?? match.match_no };
  });
  if (!data) notFound();
  const { match, events } = data;
  const imageUrl = data.upload ? screenshotUrl(data.upload.id) : null;

  const pm = toPerspective(match, pair);
  const left = sideOnScreen(match, "left");
  const right = sideOnScreen(match, "right");
  const keyOf = (pid: string): PlayerKey => (pid === pair.a.id ? "a" : "b");
  const leftKey = keyOf(left.player_id);
  const rightKey = keyOf(right.player_id);
  const nameOf = (pid: string | null) => (pid === pair.a.id ? pair.a.display_name : pid === pair.b.id ? pair.b.display_name : "Someone");
  const winnerText = pm.winner === "draw" ? "Draw" : `${pair[pm.winner].display_name} won`;

  return (
    <div className="space-y-6">
      <Link href="/matches" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Match history
      </Link>

      <section className="panel overflow-hidden">
        <div className={cn("pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r to-transparent", leftKey === "a" ? "from-player-a/15" : "from-player-b/15")} />
        <div className={cn("pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l to-transparent", rightKey === "a" ? "from-player-a/15" : "from-player-b/15")} />
        <div className="relative p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-lg font-bold tracking-wider">MATCH #{match.match_no}</h1>
              <StatusBadge status={match.status} />
            </div>
            <span className="eyebrow">Full time · {winnerText}</span>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            {[left, right].map((s, i) => {
              const k = i === 0 ? leftKey : rightKey;
              return (
                <div key={s.screen_side} className={cn("min-w-0", i === 1 && "order-3 text-right")}>
                  <p className="eyebrow">{s.screen_side}</p>
                  <p className={cn("truncate font-display text-lg font-bold sm:text-2xl", k === "a" ? "text-player-a" : "text-player-b")}>
                    {pair[k].display_name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[s.team_name, s.onscreen_label ? `“${s.onscreen_label}”` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
              );
            })}
            <p className="order-2 font-display text-5xl font-bold tabular sm:text-7xl">
              <span className={leftKey === "a" ? "text-player-a" : "text-player-b"}>{left.goals}</span>
              <span className="mx-2 text-muted-foreground sm:mx-3">–</span>
              <span className={rightKey === "a" ? "text-player-a" : "text-player-b"}>{right.goals}</span>
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" aria-hidden />{formatMatchDate(match.played_at) ?? "Date unknown"}</span>
            <span className="inline-flex items-center gap-1.5"><Upload className="size-3.5" aria-hidden />Uploaded by {nameOf(match.created_by)} · {formatTimestamp(match.created_at)}</span>
          </div>
          {match.status_note && (
            <p className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">“{match.status_note}”</p>
          )}
        </div>
      </section>

      <MatchActions match={match} pair={pair} me={ctx.me} maxMatchNo={data.maxNo} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
        <section aria-labelledby="shot-heading" className="space-y-3">
          <h2 id="shot-heading" className="eyebrow">Original screenshot</h2>
          {imageUrl ? (
            <ScreenshotViewer src={imageUrl} />
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              <ImageOff className="size-4" aria-hidden /> Entered manually — no screenshot.
            </div>
          )}
        </section>
        <section aria-labelledby="stats-heading" className="panel p-4 sm:p-6">
          <div className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span className={leftKey === "a" ? "text-player-a" : "text-player-b"}>{pair[leftKey].display_name}</span>
            <h2 id="stats-heading" className="eyebrow">Match stats</h2>
            <span className={rightKey === "a" ? "text-player-a" : "text-player-b"}>{pair[rightKey].display_name}</span>
          </div>
          <SideBySideStats left={left} right={right} leftKey={leftKey} rightKey={rightKey} />
        </section>
      </div>

      <section aria-labelledby="audit-heading" className="panel p-4 sm:p-6">
        <h2 id="audit-heading" className="eyebrow mb-3 flex items-center gap-2"><History className="size-3.5" aria-hidden /> Edit history</h2>
        <ol className="space-y-3">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
              <div>
                <p>
                  <strong>{nameOf(e.actor_id)}</strong> {EVENT_LABEL[e.event_type] ?? e.event_type}
                  {e.event_type === "reordered" && e.before_data && e.after_data && (
                    <> (#{(e.before_data as { match_no: number }).match_no} → #{(e.after_data as { match_no: number }).match_no})</>
                  )}
                </p>
                {e.note && <p className="text-muted-foreground">“{e.note}”</p>}
                <p className="text-xs text-muted-foreground">{formatTimestamp(e.created_at)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
