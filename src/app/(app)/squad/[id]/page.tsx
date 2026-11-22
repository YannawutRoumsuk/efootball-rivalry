import { ArrowLeft, Crown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { seatColor } from "@/components/player/seat-scope";
import { SquadAdminActions } from "@/components/squad/squad-admin";
import { SquadRadar } from "@/components/squad/squad-explorer";
import { columnName } from "@/components/squad/squad-match-card";
import { leaders } from "@/lib/domain/player-stats";
import { mvpOf, SQUAD_GROUPS, SQUAD_ROWS, squadOutcome } from "@/lib/domain/squad";
import { formatMatchDate } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/core";
import { getLocale, getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { asUser, isUuid, requirePageContext } from "@/lib/server/context";
import { loadSquadMatch, loadSquadScreenshots } from "@/lib/server/squad";

export async function generateMetadata() {
  return { title: (await getT())("squad.match") };
}

export default async function SquadMatchPage({ params }: PageProps<"/squad/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [ctx, t, locale] = await Promise.all([requirePageContext(), getT(), getLocale()]);
  const data = await asUser(ctx.userId, async (tx) => {
    const match = await loadSquadMatch(tx, id);
    return match ? { match, shots: await loadSquadScreenshots(tx, id) } : null;
  });
  if (!data) notFound();
  const { match, shots } = data;
  const outcome = squadOutcome(match);
  const mvp = mvpOf(match);
  const seatOf = (playerId: string | null) => ctx.roster.find((r) => r.id === playerId)?.seat ?? null;
  const ours = match.players.filter((p) => p.player_id);
  const radarPlayers = ours.map((p) => ({ id: p.player_id!, name: columnName(p, ctx.roster, t), seat: seatOf(p.player_id)! }));
  const radarValues = Object.fromEntries(ours.map((p) => [p.player_id!, p.stats]));

  return (
    <div className="space-y-6">
      <Link href="/squad" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {t("squad.back")}
      </Link>
      <PageHeader
        eyebrow={`${t("squad.eyebrow")} · ${formatMatchDate(match.played_at ?? match.created_at, locale)}`}
        title={`${match.team_name ?? t("squad.match")}${match.goals_for !== null && match.goals_against !== null ? `  ${match.goals_for}–${match.goals_against}` : ""}`}
        description={outcome ? t(outcome === "W" ? "outcome.win" : outcome === "D" ? "outcome.draw" : "outcome.loss") : undefined}
        actions={ctx.me?.seat === 1 ? <SquadAdminActions matchId={match.id} /> : null}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <section className="panel overflow-x-auto p-0">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-3 text-left text-xs font-medium text-muted-foreground">{t("squad.stat")}</th>
                {match.players.map((p) => {
                  const seat = seatOf(p.player_id);
                  const isMvp = mvp !== null && p.player_id === mvp;
                  return (
                    <th key={p.slot} className="p-3 text-right">
                      <span className="inline-flex items-center gap-1 font-bold" style={seat ? { color: seatColor(seat) } : undefined}>
                        {isMvp && <Crown className="size-3.5" aria-label={t("squad.mvp")} />}
                        {columnName(p, ctx.roster, t)}
                      </span>
                      {p.ingame_name && <span className="block text-[0.7rem] font-normal text-muted-foreground">{p.ingame_name}</span>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            {SQUAD_GROUPS.map((group) => (
              <tbody key={group}>
                <tr>
                  <th colSpan={match.players.length + 1} className="bg-muted/40 px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                    {t(`sqg.${group}` as MessageKey)}
                  </th>
                </tr>
                {SQUAD_ROWS.filter((r) => r.group === group)
                  .flatMap((r) => r.keys.map((k) => ({ r, k })))
                  .map(({ r, k }) => {
                    const values = match.players.map((p) => p.stats[k] ?? null);
                    const best = leaders(values, false, 0);
                    return (
                      <tr key={k} className="border-b last:border-0">
                        <th scope="row" className="px-3 py-1.5 text-left font-normal">
                          {t(`sq.${k}` as MessageKey)}
                        </th>
                        {match.players.map((p, i) => {
                          const seat = seatOf(p.player_id) ?? 2;
                          const v = values[i];
                          const lead = best.includes(i);
                          return (
                            <td key={p.slot} className={cn("px-3 py-1.5 text-right tabular", k === "total_points" && "text-base font-black")}>
                              {lead ? (
                                <span
                                  className="leader-row inline-block rounded px-1.5 py-0.5 font-bold"
                                  style={{ background: seatColor(seat), color: "var(--on-seat)", "--glow": seatColor(seat) } as CSSProperties}
                                >
                                  {v}
                                  {r.format === "pct" && "%"}
                                </span>
                              ) : v === null ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <>
                                  {v}
                                  {r.format === "pct" && "%"}
                                </>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            ))}
          </table>
        </section>
        <div className="space-y-4">
          {radarPlayers.length > 0 && (
            <section className="panel p-4">
              <SquadRadar players={radarPlayers} values={radarValues} className="h-64" />
            </section>
          )}
          {shots.length > 0 && (
            <section className="panel p-4">
              <h2 className="mb-2 text-sm font-semibold">{t("squad.screenshots")}</h2>
              <div className="grid grid-cols-3 gap-2">
                {shots.map((s, i) => (
                  <a key={s} href={`/api/squad/screenshots/${s}`} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked route */}
                    <img src={`/api/squad/screenshots/${s}`} alt={`#${i + 1}`} loading="lazy" className="aspect-video w-full rounded-md border object-cover" />
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
