"use client";

import { ArrowUpDown, Ban, Flag, Loader2, Pencil, RotateCcw, ShieldCheck } from "lucide-react";
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
import { resolvePlayers, toSideInputs, type MatchDraft } from "@/lib/client/draft";
import type { Match, PlayerKey, PlayerPair, ScreenSide } from "@/lib/domain/types";
import { hasErrors, validateSides, type DraftSide } from "@/lib/domain/validation";

type Action = "dispute" | "resolve" | "void" | "restore";

interface MatchActionsProps {
  match: Match;
  pair: PlayerPair;
  me: PlayerKey;
  maxMatchNo: number;
}

function toDraftSide(m: Match, side: ScreenSide): DraftSide {
  const found = m.sides.find((s) => s.screen_side === side)!;
  const draft: Partial<typeof found> = { ...found };
  delete draft.player_id;
  delete draft.screen_side;
  return draft as DraftSide;
}

export function MatchActions({ match, pair, me, maxMatchNo }: MatchActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [statusAction, setStatusAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [position, setPosition] = useState(String(match.match_no));
  const myId = pair[me].id;

  const initialDraft = (): MatchDraft => ({
    left: toDraftSide(match, "left"),
    right: toDraftSide(match, "right"),
    leftOwner: match.sides.find((s) => s.screen_side === "left")!.player_id === myId ? "me" : "friend",
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
      toast.error(err instanceof ApiError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  const submitStatus = () =>
    run(
      () => apiFetch(`/api/matches/${match.id}/status`, { method: "POST", body: JSON.stringify({ action: statusAction, note: note || null }) }),
      { dispute: "Match flagged as disputed", resolve: "Dispute resolved", void: "Match voided", restore: "Match restored" }[statusAction!],
    );

  const submitEdit = () => {
    const players = resolvePlayers(pair, myId, draft.leftOwner!);
    return run(
      () =>
        apiFetch(`/api/matches/${match.id}`, {
          method: "PATCH",
          body: JSON.stringify({ played_on: draft.playedOn, sides: toSideInputs(draft, players), note: editNote || null }),
        }),
      "Match corrected",
    );
  };

  const submitMove = () =>
    run(
      () => apiFetch(`/api/matches/${match.id}/move`, { method: "POST", body: JSON.stringify({ match_no: Number(position) }) }),
      "Match order updated",
    );

  const keyOf = (id: string): PlayerKey => (pair.a.id === id ? "a" : "b");
  const players = draft.leftOwner ? resolvePlayers(pair, myId, draft.leftOwner) : null;
  const statusCopy: Record<Action, { title: string; body: string; needsNote: boolean; cta: string }> = {
    dispute: { title: "Report a mistake", body: "Disputed matches are excluded from official stats until resolved.", needsNote: true, cta: "Flag as disputed" },
    resolve: { title: "Resolve dispute", body: "The match counts toward official stats again.", needsNote: false, cta: "Mark resolved" },
    void: { title: "Void this match", body: "Voided matches stay in history (with an audit trail) but never count.", needsNote: true, cta: "Void match" },
    restore: { title: "Restore match", body: "The match becomes confirmed again.", needsNote: false, cta: "Restore" },
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {match.status !== "void" && (
          <Button variant="outline" className="h-10" onClick={() => { setDraft(initialDraft()); setEditing(true); }}>
            <Pencil /> Correct
          </Button>
        )}
        {match.status === "confirmed" && (
          <Button variant="outline" className="h-10 text-warning" onClick={() => setStatusAction("dispute")}>
            <Flag /> Dispute
          </Button>
        )}
        {match.status === "disputed" && (
          <Button variant="outline" className="h-10 text-success" onClick={() => setStatusAction("resolve")}>
            <ShieldCheck /> Resolve
          </Button>
        )}
        {match.status !== "void" ? (
          <Button variant="ghost" className="h-10 text-destructive" onClick={() => setStatusAction("void")}>
            <Ban /> Void
          </Button>
        ) : (
          <Button variant="outline" className="h-10" onClick={() => setStatusAction("restore")}>
            <RotateCcw /> Restore
          </Button>
        )}
        <Button variant="ghost" className="h-10" onClick={() => setMoving(true)}>
          <ArrowUpDown /> Reorder
        </Button>
      </div>

      <Dialog open={statusAction !== null} onOpenChange={(o) => !o && setStatusAction(null)}>
        {statusAction && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{statusCopy[statusAction].title}</DialogTitle>
              <DialogDescription>{statusCopy[statusAction].body}</DialogDescription>
            </DialogHeader>
            {statusCopy[statusAction].needsNote && (
              <div className="space-y-2">
                <Label htmlFor="status-note">Reason</Label>
                <Textarea id="status-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Score was actually 2–3" />
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStatusAction(null)}>Cancel</Button>
              <Button disabled={busy || (statusCopy[statusAction].needsNote && !note.trim())} onClick={submitStatus}>
                {busy && <Loader2 className="animate-spin" />} {statusCopy[statusAction].cta}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={moving} onOpenChange={setMoving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change match order</DialogTitle>
            <DialogDescription>Streaks and timelines follow this order. Other matches shift to make room.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="position">Position (1 – {maxMatchNo})</Label>
            <Input id="position" type="number" inputMode="numeric" min={1} max={maxMatchNo} value={position} onChange={(e) => setPosition(e.target.value)} className="h-11" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoving(false)}>Cancel</Button>
            <Button disabled={busy || !Number(position)} onClick={submitMove}>
              {busy && <Loader2 className="animate-spin" />} Move to #{position || "?"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Correct match #{match.match_no}</DialogTitle>
            <DialogDescription>Every change is recorded in the match history with before/after values.</DialogDescription>
          </DialogHeader>
          <SideAssign left={draft.left} right={draft.right} pair={pair} me={me} value={draft.leftOwner} onChange={(o) => setDraft((d) => ({ ...d, leftOwner: o }))} />
          <StatsEditor
            left={draft.left}
            right={draft.right}
            meta={
              players
                ? {
                    left: { name: pair[keyOf(players.left)].display_name, playerKey: keyOf(players.left) },
                    right: { name: pair[keyOf(players.right)].display_name, playerKey: keyOf(players.right) },
                  }
                : { left: null, right: null }
            }
            issues={issues}
            playedOn={draft.playedOn}
            onSideChange={(side, patch) => setDraft((d) => ({ ...d, [side]: { ...d[side], ...patch } }))}
            onPlayedOnChange={(v) => setDraft((d) => ({ ...d, playedOn: v }))}
          />
          <div className="space-y-2">
            <Label htmlFor="edit-note">What changed? (optional)</Label>
            <Input id="edit-note" value={editNote} onChange={(e) => setEditNote(e.target.value)} maxLength={500} className="h-11" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button disabled={busy || !draft.leftOwner || hasErrors(issues)} onClick={submitEdit}>
              {busy && <Loader2 className="animate-spin" />} Save correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
