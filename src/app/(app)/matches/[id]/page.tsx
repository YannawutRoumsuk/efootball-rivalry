import { ArrowLeft, CalendarDays, History, ImageOff, Upload } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchActions } from "@/components/matches/match-actions";
import { SideBySideStats } from "@/components/matches/side-by-side-stats";
import { StatusBadge } from "@/components/matches/status-badge";
import { ScreenshotViewer } from "@/components/upload/screenshot-viewer";
import { PairScope } from "@/components/player/seat-scope";
import { pairFor } from "@/lib/domain/league";
import { sideOnScreen, toPerspective } from "@/lib/domain/match";
import type { PlayerKey } from "@/lib/domain/types";
import { formatMatchDate, formatTimestamp } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/core";
import { getLocale, getT } from "@/lib/i18n/server";
import { asUser, requirePageContext, isUuid, loadMatch } from "@/lib/server/context";
import { screenshotUrl } from "@/lib/server/storage";
import { cn } from "@/lib/utils";

export async function generateMetadata() {
  return { title: (await getT())("detail.title") };
}

interface MatchEvent {
  id: string;
  event_type: string;
  actor_id: string | null;
  note: string | null;
  created_at: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
}

const EVENT_LABEL: Record<string, MessageKey> = {
  created: "event.created",
  updated: "event.updated",
  disputed: "event.disputed",
  resolved: "event.resolved",
  voided: "event.voided",
  restored: "event.restored",
  reordered: "event.reordered",
};

const seatText = (k: PlayerKey) => (k === "a" ? "text-player-a" : "text-player-b");

export default async function MatchDetailPage({ params }: PageProps<"/matches/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [ctx, t, locale] = await Promise.all([requirePageContext(), getT(), getLocale()]);
  if (!ctx.me) notFound();
  const me = ctx.me;

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

  const pair = pairFor(ctx.roster, match.sides[0].player_id, match.sides[1].player_id);
  const pm = toPerspective(match, pair);
  const left = sideOnScreen(match, "left");
  const right = sideOnScreen(match, "right");
  const keyOf = (pid: string): PlayerKey => (pid === pair.a.id ? "a" : "b");
  const leftKey = keyOf(left.player_id);
  const rightKey = keyOf(right.player_id);
  const nameOf = (pid: string | null) => ctx.roster.find((p) => p.id === pid)?.display_name ?? t("detail.someone");
  const winnerText = pm.winner === "draw" ? t("detail.drawn") : t("detail.won", { name: pair[pm.winner].display_name });

  return (
    <PairScope seats={pair.seats}>
      <div className="space-y-6">
        <Link href="/matches" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {t("detail.back")}
        </Link>

        <section className="panel overflow-hidden">
          <div className="flex h-1" aria-hidden>
            <span className={cn("flex-1", leftKey === "a" ? "bg-player-a" : "bg-player-b")} />
            <span className={cn("flex-1", rightKey === "a" ? "bg-player-a" : "bg-player-b")} />
          </div>
          <div className="p-5 sm:p-7">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold">{t("card.match", { n: match.match_no })}</h1>
                <StatusBadge status={match.status} label={t(`status.${match.status}`)} />
              </div>
              <span className="eyebrow">
                {t("detail.fullTime")} · {winnerText}
              </span>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              {[left, right].map((s, i) => {
                const k = i === 0 ? leftKey : rightKey;
                return (
                  <div key={s.screen_side} className={cn("min-w-0", i === 1 && "order-3 text-right")}>
                    <p className="eyebrow">{t(s.screen_side === "left" ? "common.Left" : "common.Right")}</p>
                    <p className={cn("truncate text-lg font-semibold sm:text-2xl", seatText(k))}>{pair[k].display_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[s.team_name, s.onscreen_label ? `“${s.onscreen_label}”` : null].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                );
              })}
              <p className="order-2 text-5xl font-bold tabular sm:text-6xl">
                <span className={seatText(leftKey)}>{left.goals}</span>
                <span className="mx-2 text-muted-foreground sm:mx-3">–</span>
                <span className={seatText(rightKey)}>{right.goals}</span>
              </p>
            </div>

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden />
                {formatMatchDate(match.played_at, locale) ?? t("common.dateUnknown")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Upload className="size-3.5" aria-hidden />
                {t("detail.uploadedBy", { name: nameOf(match.created_by), time: formatTimestamp(match.created_at, locale) })}
              </span>
            </div>
            {match.status_note && <p className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">“{match.status_note}”</p>}
          </div>
        </section>

        <MatchActions match={match} roster={ctx.roster} meId={me.id} maxMatchNo={data.maxNo} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
          <section aria-labelledby="shot-heading" className="space-y-3">
            <h2 id="shot-heading" className="text-sm font-semibold">
              {t("detail.screenshot")}
            </h2>
            {imageUrl ? (
              <ScreenshotViewer src={imageUrl} />
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                <ImageOff className="size-4" aria-hidden /> {t("detail.manual")}
              </div>
            )}
          </section>
          <section aria-labelledby="stats-heading" className="panel p-4 sm:p-6">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span className={seatText(leftKey)}>{pair[leftKey].display_name}</span>
              <h2 id="stats-heading" className="eyebrow">
                {t("detail.stats")}
              </h2>
              <span className={seatText(rightKey)}>{pair[rightKey].display_name}</span>
            </div>
            <SideBySideStats left={left} right={right} leftKey={leftKey} rightKey={rightKey} />
          </section>
        </div>

        <section aria-labelledby="audit-heading" className="panel p-4 sm:p-6">
          <h2 id="audit-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <History className="size-4 text-muted-foreground" aria-hidden /> {t("detail.history")}
          </h2>
          <ol className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
                <div>
                  <p>
                    <strong>{nameOf(e.actor_id)}</strong> {EVENT_LABEL[e.event_type] ? t(EVENT_LABEL[e.event_type]) : e.event_type}
                    {e.event_type === "reordered" && e.before_data && e.after_data && (
                      <>
                        {" "}
                        (#{(e.before_data as { match_no: number }).match_no} → #{(e.after_data as { match_no: number }).match_no})
                      </>
                    )}
                  </p>
                  {e.note && <p className="text-muted-foreground">“{e.note}”</p>}
                  <p className="text-xs text-muted-foreground">{formatTimestamp(e.created_at, locale)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </PairScope>
  );
}
