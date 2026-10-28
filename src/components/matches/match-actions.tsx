"use client";

import { ArrowUpDown, Ban, Flag, Loader2, Pencil, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatsEditor } from "@/components/upload/stats-editor";
import { SideAssign } from "@/components/upload/side-assign";
import { apiFetch, ApiError } from "@/lib/api/envelope";
import { playersChosen, toSideInputs, type MatchDraft } from "@/lib/client/draft";
import type { RosterPlayer } from "@/lib/domain/league";
import type { Match, ScreenSide } from "@/lib/domain/types";
import { hasErrors, validateSides, type DraftSide } from "@/lib/domain/validation";
import { useT } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/errors";

type Action = "dispute" | "resolve" | "void" | "restore";

interface MatchActionsProps {
  match: Match;
  roster: RosterPlayer[];
  meId: string;
  maxMatchNo: number;
  /** Only the group owner (seat 1, PLAYER_1_PIN) may delete; the server enforces it too. */
  canDelete: boolean;
}

function toDraftSide(m: Match, side: ScreenSide): DraftSide {
  const found = m.sides.find((s) => s.screen_side === side)!;
  const draft: Partial<typeof found> = { ...found };
  delete draft.player_id;
  delete draft.screen_side;
  return draft as DraftSide;
}

export function MatchActions({ match, roster, meId, maxMatchNo, canDelete }: MatchActionsProps) {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [statusAction, setStatusAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [position, setPosition] = useState(String(match.match_no));

  const initialDraft = (): MatchDraft => ({
    left: toDraftSide(match, "left"),
    right: toDraftSide(match, "right"),
    leftPlayer: match.sides.find((s) => s.screen_side === "left")!.player_id,
    rightPlayer: match.sides.find((s) => s.screen_side === "right")!.player_id,
    playedOn: match.played_at ? match.played_at.slice(0, 10) : null,
  });
  const [draft, setDraft] = useState<MatchDraft>(initialDraft);
  const [editNote, setEditNote] = useState("");
  const issues = useMemo(() => validateSides(draft.left, draft.right), [draft]);

  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(success);
      setStatusAction(null);
      setEditing(false);
      setMoving(false);
      setNote("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? errorText(err, t) : t("act.failed"));
    } finally {
      setBusy(false);
    }
  }

  const submitStatus = () =>
    run(
      () => apiFetch(`/api/matches/${match.id}/status`, { method: "POST", body: JSON.stringify({ action: statusAction, note: note || null }) }),
      t(`act.done.${statusAction!}`),
    );

  const submitEdit = () => {
    return run(
      () =>
        apiFetch(`/api/matches/${match.id}`, {
          method: "PATCH",
          body: JSON.stringify({ played_on: draft.playedOn, sides: toSideInputs(draft), note: editNote || null }),
        }),
      t("act.done.edit"),
    );
  };

  async function submitDelete() {
    setBusy(true);
    try {
      await apiFetch(`/api/matches/${match.id}`, { method: "DELETE" });
      toast.success(t("act.done.delete"));
      router.replace("/matches");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? errorText(err, t) : t("act.failed"));
      setBusy(false);
    }
  }

  const submitMove = () =>
    run(
      () => apiFetch(`/api/matches/${match.id}/move`, { method: "POST", body: JSON.stringify({ match_no: Number(position) }) }),
      t("act.done.move"),
    );

  const metaFor = (id: string | null) => {
    const p = roster.find((r) => r.id === id);
    return p ? { name: p.display_name, seat: p.seat } : null;
  };
  const needsNote: Record<Action, boolean> = { dispute: true, resolve: false, void: true, restore: false };
  const statusCopy = (a: Action) => ({
    title: t(`act.${a}.title`),
    body: t(`act.${a}.body`),
    needsNote: needsNote[a],
    cta: t(`act.${a}.cta`),
  });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {match.status !== "void" && (
          <Button variant="outline" className="h-10" onClick={() => { setDraft(initialDraft()); setEditing(true); }}>
            <Pencil /> {t("act.correct")}
          </Button>
        )}
        {match.status === "confirmed" && (
          <Button variant="outline" className="h-10 text-warning" onClick={() => setStatusAction("dispute")}>
            <Flag /> {t("act.dispute")}
          </Button>
        )}
        {match.status === "disputed" && (
          <Button variant="outline" className="h-10 text-success" onClick={() => setStatusAction("resolve")}>
            <ShieldCheck /> {t("act.resolve")}
          </Button>
        )}
        {match.status !== "void" ? (
          <Button variant="ghost" className="h-10 text-destructive" onClick={() => setStatusAction("void")}>
            <Ban /> {t("act.void")}
          </Button>
        ) : (
          <Button variant="outline" className="h-10" onClick={() => setStatusAction("restore")}>
            <RotateCcw /> {t("act.restore")}
          </Button>
        )}
        <Button variant="ghost" className="h-10" onClick={() => setMoving(true)}>
          <ArrowUpDown /> {t("act.reorder")}
        </Button>
        {canDelete && (
          <Button variant="ghost" className="h-10 text-destructive" onClick={() => setDeleting(true)}>
            <Trash2 /> {t("act.delete")}
          </Button>
        )}
      </div>

      <Dialog open={deleting} onOpenChange={(o) => !busy && setDeleting(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("act.delete.title")}</DialogTitle>
            <DialogDescription>{t("act.delete.body", { n: match.match_no })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setDeleting(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={submitDelete}>
              {busy && <Loader2 className="animate-spin" />} {t("act.delete.cta")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusAction !== null} onOpenChange={(o) => !o && setStatusAction(null)}>
        {statusAction && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{statusCopy(statusAction).title}</DialogTitle>
              <DialogDescription>{statusCopy(statusAction).body}</DialogDescription>
            </DialogHeader>
            {needsNote[statusAction] && (
              <div className="space-y-2">
                <Label htmlFor="status-note">{t("act.reason")}</Label>
                <Textarea id="status-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t("act.reasonPlaceholder")} />
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStatusAction(null)}>
                {t("common.cancel")}
              </Button>
              <Button disabled={busy || (needsNote[statusAction] && !note.trim())} onClick={submitStatus}>
                {busy && <Loader2 className="animate-spin" />} {statusCopy(statusAction).cta}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={moving} onOpenChange={setMoving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("act.moveTitle")}</DialogTitle>
            <DialogDescription>{t("act.moveBody")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="position">{t("act.position", { max: maxMatchNo })}</Label>
            <Input id="position" type="number" inputMode="numeric" min={1} max={maxMatchNo} value={position} onChange={(e) => setPosition(e.target.value)} className="h-11" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoving(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={busy || !Number(position)} onClick={submitMove}>
              {busy && <Loader2 className="animate-spin" />} {t("act.moveCta", { n: position || "?" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("act.editTitle", { n: match.match_no })}</DialogTitle>
            <DialogDescription>{t("act.editBody")}</DialogDescription>
          </DialogHeader>
          <SideAssign
            left={draft.left}
            right={draft.right}
            roster={roster}
            meId={meId}
            leftPlayer={draft.leftPlayer}
            rightPlayer={draft.rightPlayer}
            onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
          />
          <StatsEditor
            left={draft.left}
            right={draft.right}
            meta={{ left: metaFor(draft.leftPlayer), right: metaFor(draft.rightPlayer) }}
            issues={issues}
            playedOn={draft.playedOn}
            onSideChange={(side, patch) => setDraft((d) => ({ ...d, [side]: { ...d[side], ...patch } }))}
            onPlayedOnChange={(v) => setDraft((d) => ({ ...d, playedOn: v }))}
          />
          <div className="space-y-2">
            <Label htmlFor="edit-note">{t("act.editNote")}</Label>
            <Input id="edit-note" value={editNote} onChange={(e) => setEditNote(e.target.value)} maxLength={500} className="h-11" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              {t("common.cancel")}
            </Button>
            <Button disabled={busy || !playersChosen(draft) || hasErrors(issues)} onClick={submitEdit}>
              {busy && <Loader2 className="animate-spin" />} {t("act.saveCorrection")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
