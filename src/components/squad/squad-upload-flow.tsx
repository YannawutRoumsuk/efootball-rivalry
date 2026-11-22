"use client";

import { AlertTriangle, ImagePlus, Loader2, ScanText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  columnsToEditor,
  editorToInput,
  saveSquad,
  todayLocal,
  uploadSquadScreenshot,
  type EditorDraft,
  type SquadUploadResponse,
} from "@/lib/client/squad";
import { prepareImageFile } from "@/lib/client/upload";
import type { RosterPlayer } from "@/lib/domain/league";
import { mergeScreenReads, validateSquadColumns, type NameAlias } from "@/lib/domain/squad";
import { useT } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/errors";
import { SquadEditor } from "./squad-editor";

interface Props {
  roster: RosterPlayer[];
  aliases: NameAlias[];
}

/** Matches the API's upload_ids limit. */
const MAX_SHOTS = 12;

interface Shot {
  index: number;
  response: SquadUploadResponse;
}

/**
 * Pick 5–6 screenshots → each is stored and read on the server one by one →
 * the reads are merged column by column → review → save.
 */
export function SquadUploadFlow({ roster, aliases }: Props) {
  const t = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState<{ i: number; n: number } | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const merged = useMemo(() => mergeScreenReads(shots.map((s) => s.response.read), aliases), [shots, aliases]);
  const flagged = useMemo(() => new Set(merged.conflicts.map((c) => `${c.slot}:${c.key}`)), [merged]);

  async function addFiles(picked: File[]) {
    if (busy || picked.length === 0) return;
    const room = MAX_SHOTS - shots.length;
    if (picked.length > room) setNotes((prev) => [...prev, t("squad.up.tooMany", { n: MAX_SHOTS })]);
    const files = picked.slice(0, Math.max(0, room));
    if (files.length === 0) return;
    const added: Shot[] = [];
    const messages: string[] = [];
    const offset = shots.length;
    for (const [i, raw] of files.entries()) {
      const n = offset + i + 1;
      setBusy({ i: i + 1, n: files.length });
      try {
        const response = await uploadSquadScreenshot(await prepareImageFile(raw));
        if (response.read.rows.length === 0) messages.push(t("squad.up.notTable", { i: n }));
        else added.push({ index: n, response });
        if (response.duplicateOf) messages.push(t("squad.up.duplicate", { i: n }));
      } catch (err) {
        messages.push(`#${n}: ${errorText(err, t)}`);
      }
    }
    setBusy(null);
    const all = [...shots, ...added];
    setShots(all);
    setNotes((prev) => [...prev, ...messages]);
    if (all.length === 0) return;
    const next = mergeScreenReads(all.map((s) => s.response.read), aliases);
    // Keep anything the user already typed; fill only cells that are still empty.
    setDraft((prev) => {
      const fresh = columnsToEditor(next.columns);
      if (!prev) {
        const sum = next.columns.reduce((n, c) => n + (c.stats.goals ?? 0), 0);
        const allGoals = next.columns.every((c) => c.stats.goals != null);
        return { team: next.team ?? "", playedOn: todayLocal(), goalsFor: allGoals ? String(sum) : "", goalsAgainst: "", columns: fresh };
      }
      return {
        ...prev,
        team: prev.team || next.team || "",
        columns: prev.columns.map((c, i) => ({
          ...c,
          ingameName: c.ingameName || fresh[i].ingameName,
          player: c.player || fresh[i].player,
          stats: { ...fresh[i].stats, ...Object.fromEntries(Object.entries(c.stats).filter(([, v]) => v !== "")) },
        })),
      };
    });
  }

  const input3 = draft ? editorToInput(draft, shots.map((s) => s.response.uploadId)) : null;
  const issues = input3 ? validateSquadColumns(input3.players.map((p) => ({ slot: p.slot, playerId: p.player_id, stats: p.stats }))) : [];

  async function save() {
    if (!input3) return;
    setSaving(true);
    try {
      const { id } = await saveSquad(input3, null);
      toast.success(t("squad.saved"));
      router.push(`/squad/${id}`);
      router.refresh();
    } catch (err) {
      toast.error(errorText(err, t));
      setSaving(false);
    }
  }

  const picker = (
    <input
      ref={input}
      type="file"
      multiple
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        void addFiles(files);
      }}
    />
  );

  if (!draft) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-card px-6 py-14 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void addFiles([...(e.dataTransfer.files ?? [])]);
        }}
      >
        {busy ? (
          <div className="w-full max-w-xs space-y-3">
            <ScanText className="mx-auto size-8 animate-pulse text-muted-foreground" aria-hidden />
            <p className="font-medium">{t("squad.up.reading", busy)}</p>
            <Progress value={((busy.i - 1) / busy.n) * 100} />
          </div>
        ) : (
          <>
            <span className="mb-5 flex size-14 items-center justify-center rounded-full bg-muted">
              <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-lg font-semibold">{t("squad.up.title")}</p>
            <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{t("squad.up.body")}</p>
            <Button className="mt-6 h-11 px-6" onClick={() => input.current?.click()}>
              {t("squad.up.pick")}
            </Button>
            {notes.length > 0 && <Notes notes={notes} />}
          </>
        )}
        {picker}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="panel space-y-3 p-4">
        <p className="text-sm">{t("squad.up.readDone", { n: shots.length })}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {shots.map((s) => (
            <a key={s.response.uploadId} href={s.response.imageUrl} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked route */}
              <img src={s.response.imageUrl} alt={`#${s.index}`} className="h-16 w-auto rounded-md border object-cover" />
            </a>
          ))}
          <Button variant="outline" className="h-16 shrink-0" disabled={busy !== null} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            {busy ? t("squad.up.reading", busy) : t("squad.up.more")}
          </Button>
        </div>
        {merged.missingRows.length > 0 && <Notes notes={[t("squad.up.missing", { rows: merged.missingRows.join(", ") })]} />}
        {merged.conflicts.length > 0 && <Notes notes={[t("squad.up.conflicts", { n: merged.conflicts.length })]} />}
        {notes.length > 0 && <Notes notes={notes} />}
      </div>
      <SquadEditor draft={draft} roster={roster} onChange={setDraft} flagged={flagged} />
      <div className="sticky bottom-20 z-20 flex flex-wrap items-center justify-end gap-3 rounded-xl border bg-background/95 p-3 backdrop-blur md:bottom-4">
        {issues.length > 0 && <p className="mr-auto text-sm text-destructive">{t("squad.up.needPlayers")}</p>}
        <Button className="h-11 px-6" disabled={saving || issues.length > 0 || busy !== null} onClick={save}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {saving ? t("squad.saving") : t("squad.save")}
        </Button>
      </div>
      {picker}
    </div>
  );
}

function Notes({ notes }: { notes: string[] }) {
  return (
    <ul className="mt-3 space-y-1 text-left text-xs text-amber-700 dark:text-amber-400">
      {notes.map((n, i) => (
        <li key={i} className="flex items-start gap-1.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {n}
        </li>
      ))}
    </ul>
  );
}
