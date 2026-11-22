"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteSquad, editorToInput, saveSquad, type EditorDraft } from "@/lib/client/squad";
import type { RosterPlayer } from "@/lib/domain/league";
import { validateSquadColumns } from "@/lib/domain/squad";
import { useT } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/errors";
import { SquadEditor } from "./squad-editor";

/** Owner-only buttons on a saved 3v3 match. */
export function SquadAdminActions({ matchId }: { matchId: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(t("squad.deleteConfirm"))) return;
    setBusy(true);
    try {
      await deleteSquad(matchId);
      toast.success(t("squad.deleted"));
      router.push("/squad");
      router.refresh();
    } catch (err) {
      toast.error(errorText(err, t));
      setBusy(false);
    }
  }
  return (
    <div className="flex gap-2">
      <Button asChild variant="outline" className="h-10">
        <Link href={`/squad/${matchId}/edit`}>
          <Pencil className="size-4" aria-hidden /> {t("squad.edit")}
        </Link>
      </Button>
      <Button variant="outline" className="h-10 text-destructive hover:text-destructive" disabled={busy} onClick={remove}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />} {t("squad.delete")}
      </Button>
    </div>
  );
}

/** Edit form for a saved match (owner only; the server enforces it). */
export function SquadEditForm({ matchId, initial, roster }: { matchId: string; initial: EditorDraft; roster: RosterPlayer[] }) {
  const t = useT();
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const input = editorToInput(draft, []);
  const issues = validateSquadColumns(input.players.map((p) => ({ slot: p.slot, playerId: p.player_id, stats: p.stats })));
  async function save() {
    setSaving(true);
    try {
      await saveSquad(input, matchId);
      toast.success(t("squad.saved"));
      router.push(`/squad/${matchId}`);
      router.refresh();
    } catch (err) {
      toast.error(errorText(err, t));
      setSaving(false);
    }
  }
  return (
    <div className="space-y-5">
      <SquadEditor draft={draft} roster={roster} onChange={setDraft} />
      <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-end gap-3 rounded-xl border bg-background/95 p-3 backdrop-blur md:bottom-4">
        {issues.length > 0 && <p className="mr-auto text-sm text-destructive">{t("squad.up.needPlayers")}</p>}
        <Button asChild variant="ghost" className="h-11">
          <Link href={`/squad/${matchId}`}>{t("common.cancel")}</Link>
        </Button>
        <Button className="h-11 px-6" disabled={saving || issues.length > 0} onClick={save}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {saving ? t("squad.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
