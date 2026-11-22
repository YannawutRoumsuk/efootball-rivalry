import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { SquadEditForm } from "@/components/squad/squad-admin";
import { columnsToEditor, teamSideToEditor, type EditorDraft } from "@/lib/client/squad";
import { SQUAD_SLOTS } from "@/lib/domain/squad";
import { getT } from "@/lib/i18n/server";
import { asUser, isUuid, requirePageContext } from "@/lib/server/context";
import { loadSquadMatch } from "@/lib/server/squad";

export async function generateMetadata() {
  return { title: (await getT())("squad.edit") };
}

export default async function SquadEditPage({ params }: PageProps<"/squad/[id]/edit">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [ctx, t] = await Promise.all([requirePageContext(), getT()]);
  if (ctx.me?.seat !== 1) redirect(`/squad/${id}`);
  const match = await asUser(ctx.userId, (tx) => loadSquadMatch(tx, id));
  if (!match) notFound();

  const columns = SQUAD_SLOTS.map((slot) => {
    const p = match.players.find((x) => x.slot === slot);
    return { slot, ingameName: p?.ingame_name ?? null, playerId: p ? (p.player_id ?? null) : null, stats: p?.stats ?? {}, awards: p?.awards ?? [] };
  });
  const initial: EditorDraft = {
    team: match.team_name ?? "",
    opponent: match.opponent_name ?? "",
    teamUs: teamSideToEditor(match.team_stats?.us),
    teamThem: teamSideToEditor(match.team_stats?.them),
    playedOn: (match.played_at ?? match.created_at).slice(0, 10),
    goalsFor: match.goals_for === null ? "" : String(match.goals_for),
    goalsAgainst: match.goals_against === null ? "" : String(match.goals_against),
    columns: columnsToEditor(columns).map((c, i) => {
      const p = match.players.find((x) => x.slot === columns[i].slot);
      // A saved column without a member is a stranger.
      return p && !p.player_id ? { ...c, player: "guest" } : c;
    }),
  };

  return (
    <div className="space-y-6">
      <Link href={`/squad/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> {t("common.back")}
      </Link>
      <PageHeader eyebrow={t("squad.eyebrow")} title={t("squad.edit")} description={t("squad.ownerOnly")} />
      <SquadEditForm matchId={id} initial={initial} roster={ctx.roster} />
    </div>
  );
}
