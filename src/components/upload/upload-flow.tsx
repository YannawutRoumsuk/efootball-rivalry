"use client";

import { ArrowLeft, Bot, Check, Keyboard, Loader2, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ApiError } from "@/lib/api/envelope";
import { emptyDraft, playersChosen, toSideInputs, type MatchDraft } from "@/lib/client/draft";
import { checkDuplicates, extractUpload, saveMatch, type SaveResult } from "@/lib/client/matches";
import { prepareImageFile, uploadScreenshot } from "@/lib/client/upload";
import type { DuplicateCandidate } from "@/lib/domain/duplicates";
import type { RosterPlayer } from "@/lib/domain/league";
import type { ScreenSide } from "@/lib/domain/types";
import { hasErrors, validateSides, type DraftSide, type ValidationIssue } from "@/lib/domain/validation";
import { DuplicateWarning } from "./duplicate-warning";
import { ImagePicker } from "./image-picker";
import { RecordsCelebration } from "./records-celebration";
import { ScreenshotViewer } from "./screenshot-viewer";
import { SideAssign } from "./side-assign";
import { StatsEditor, type SideMeta } from "./stats-editor";

type Step = "pick" | "processing" | "assign" | "review" | "duplicate" | "done";
type Phase = "converting" | "uploading" | "extracting";

interface UploadFlowProps {
  roster: RosterPlayer[];
  meId: string;
  aiEnabled: boolean;
}

const STEPS: Array<{ id: Step; label: string }> = [
  { id: "pick", label: "Upload" },
  { id: "assign", label: "Sides" },
  { id: "review", label: "Review" },
  { id: "done", label: "Saved" },
];

export function UploadFlow({ roster, meId, aiEnabled }: UploadFlowProps) {
  const [step, setStep] = useState<Step>("pick");
  const [phase, setPhase] = useState<Phase>("uploading");
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MatchDraft>(emptyDraft);
  const [aiNote, setAiNote] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [aiIssues, setAiIssues] = useState<ValidationIssue[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SaveResult | null>(null);

  const chosen = playersChosen(draft);
  const metaFor = (id: string | null): SideMeta | null => {
    const p = roster.find((r) => r.id === id);
    return p ? { name: p.display_name, seat: p.seat } : null;
  };
  const meta: Record<ScreenSide, SideMeta | null> = { left: metaFor(draft.leftPlayer), right: metaFor(draft.rightPlayer) };
  const assign = (
    <SideAssign
      left={draft.left}
      right={draft.right}
      roster={roster}
      meId={meId}
      leftPlayer={draft.leftPlayer}
      rightPlayer={draft.rightPlayer}
      onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
    />
  );

  const issues = useMemo(() => {
    const live = validateSides(draft.left, draft.right);
    // Keep AI "unreadable" notes only while the field is still empty.
    const stale = aiIssues.filter(
      (i) => /isn't valid/.test(i.message) && i.side !== "match" && i.field && draft[i.side][i.field] === null,
    );
    return [...live, ...stale];
  }, [draft, aiIssues]);

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setStep("pick");
    setPreview(null);
    setUploadId(null);
    setDraft(emptyDraft());
    setAiNote(null);
    setAiIssues([]);
    setDuplicates([]);
    setSaved(null);
    setProgress(0);
  }

  async function onPick(original: File) {
    setStep("processing");
    setPhase("converting");
    setProgress(0);
    try {
      const file = await prepareImageFile(original);
      setPreview(URL.createObjectURL(file));
      setPhase("uploading");
      const up = await uploadScreenshot(file, setProgress);
      setUploadId(up.uploadId);
      setDuplicates(up.duplicates);
      if (up.imageUrl) setPreview(up.imageUrl);

      if (!aiEnabled) {
        setAiNote({ tone: "warn", text: "AI extraction isn't configured — enter the result manually." });
        setStep("assign");
        return;
      }
      setPhase("extracting");
      try {
        const res = await extractUpload(up.uploadId);
        setDraft((d) => ({ ...d, left: res.left, right: res.right }));
        setAiIssues(res.issues);
        const missing = [res.left, res.right].reduce(
          (n, s) => n + Object.values(s).filter((v) => v === null).length,
          0,
        );
        setAiNote({
          tone: missing > 4 || res.left.goals === null || res.right.goals === null ? "warn" : "ok",
          text:
            res.left.goals === null || res.right.goals === null
              ? "AI couldn't read the score — please fill it in."
              : `AI read the screenshot. ${missing ? `${missing} value(s) were unreadable and left empty.` : "Check every value before saving."}`,
        });
      } catch (err) {
        setAiNote({
          tone: "warn",
          text: `${err instanceof ApiError ? err.message : "AI extraction failed."} You can enter the stats manually.`,
        });
      }
      setStep("assign");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed.");
      reset();
    }
  }

  function startManual() {
    setAiNote({ tone: "warn", text: "Manual entry — no screenshot attached." });
    setStep("review");
  }

  function patchSide(side: ScreenSide, patch: Partial<DraftSide>) {
    setDraft((d) => ({ ...d, [side]: { ...d[side], ...patch } }));
  }

  async function save(acknowledge: boolean) {
    if (!chosen) {
      toast.error("Choose who played on each side first.");
      return;
    }
    if (hasErrors(issues)) {
      toast.error("Fix the highlighted errors before saving.");
      return;
    }
    const payload = { upload_id: uploadId, played_on: draft.playedOn, sides: toSideInputs(draft) };
    setSaving(true);
    try {
      if (!acknowledge) {
        const found = await checkDuplicates(payload);
        if (found.length > 0) {
          setDuplicates(found);
          setStep("duplicate");
          return;
        }
      }
      const outcome = await saveMatch(payload, acknowledge);
      if (outcome.kind === "duplicate") {
        setDuplicates(outcome.duplicates);
        setStep("duplicate");
        return;
      }
      setSaved(outcome.result);
      setStep("done");
      toast.success(`Match #${outcome.result.matchNo} saved`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the match.");
    } finally {
      setSaving(false);
    }
  }

  const activeIndex = STEPS.findIndex((s) => s.id === (step === "processing" ? "pick" : step === "duplicate" ? "review" : step));

  return (
    <div className="space-y-6">
      <ol className="flex items-center gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                i < activeIndex ? "bg-player-a text-primary-foreground" : i === activeIndex ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              }`}
              aria-current={i === activeIndex ? "step" : undefined}
            >
              {i < activeIndex ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={`hidden text-sm sm:inline ${i === activeIndex ? "font-semibold" : "text-muted-foreground"}`}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      {step === "pick" && (
        <div className="space-y-4">
          <ImagePicker onPick={onPick} />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <button type="button" onClick={startManual} className="inline-flex items-center gap-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              <Keyboard className="size-4" aria-hidden /> Enter a result manually
            </button>
            <Link href="/upload/batch" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Import several old screenshots
            </Link>
          </div>
          {!aiEnabled && (
            <p className="text-center text-xs text-warning">AI extraction is not configured on this server — screenshots are stored and you enter the stats.</p>
          )}
        </div>
      )}

      {step === "processing" && (
        <div className="panel flex flex-col items-center gap-5 px-6 py-12 text-center" aria-live="polite">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt="Selected screenshot" className="max-h-56 rounded-xl border object-contain opacity-80" />
          )}
          <div className="flex items-center gap-2 font-display text-lg font-semibold">
            {phase === "extracting" ? <Bot className="size-5 animate-pulse text-player-a" /> : <Loader2 className="size-5 animate-spin" />}
            {phase === "converting" ? "Preparing image…" : phase === "uploading" ? `Uploading… ${progress}%` : "AI is reading the stats…"}
          </div>
          {phase === "uploading" && <Progress value={progress} className="h-2 w-full max-w-xs" />}
          {phase === "extracting" && <p className="max-w-xs text-sm text-muted-foreground">This usually takes 5–20 seconds.</p>}
        </div>
      )}

      {(step === "assign" || step === "review" || step === "duplicate") && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
          <aside className="space-y-3 lg:sticky lg:top-20">
            {preview ? (
              <ScreenshotViewer src={preview} />
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No screenshot attached</div>
            )}
            {aiNote && (
              <p className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${aiNote.tone === "ok" ? "bg-player-a/10 text-player-a" : "bg-warning/10 text-warning"}`}>
                <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden /> {aiNote.text}
              </p>
            )}
            <DuplicateWarning duplicates={duplicates} />
          </aside>

          <div className="panel space-y-6 p-4 sm:p-6">
            {step === "assign" ? (
              <>
                {assign}
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={reset} className="h-11">
                    <RotateCcw /> Start over
                  </Button>
                  <Button className="h-11 flex-1" disabled={!chosen} onClick={() => setStep("review")}>
                    Confirm sides
                  </Button>
                </div>
              </>
            ) : (
              <>
                {step === "review" && !chosen && assign}
                <StatsEditor
                  left={draft.left}
                  right={draft.right}
                  meta={meta}
                  issues={issues}
                  playedOn={draft.playedOn}
                  onSideChange={patchSide}
                  onPlayedOnChange={(v) => setDraft((d) => ({ ...d, playedOn: v }))}
                />
                {step === "duplicate" ? (
                  <div className="space-y-3">
                    <DuplicateWarning duplicates={duplicates} />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="h-11 flex-1" onClick={() => setStep("review")}>
                        Back to review
                      </Button>
                      <Button className="h-11 flex-1" disabled={saving} onClick={() => save(true)}>
                        {saving && <Loader2 className="animate-spin" />} It&apos;s a different match — save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" className="h-11" onClick={() => (preview ? setStep("assign") : reset())}>
                      <ArrowLeft /> Back
                    </Button>
                    <Button className="h-12 flex-1 text-base" disabled={saving || !chosen || hasErrors(issues)} onClick={() => save(false)}>
                      {saving && <Loader2 className="animate-spin" />} Confirm &amp; save match
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {step === "done" && saved && (
        <div className="panel mx-auto max-w-lg space-y-5 p-6 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-success/15">
            <Check className="size-7 text-success" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold">Match #{saved.matchNo} saved</h2>
            <p className="mt-1 text-sm text-muted-foreground">Everyone sees it on their dashboard right away.</p>
          </div>
          <RecordsCelebration records={saved.records} />
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 flex-1" onClick={reset}>
              Upload another
            </Button>
            <Button asChild variant="outline" className="h-11 flex-1">
              <Link href={`/matches/${saved.matchId}`}>View match</Link>
            </Button>
            <Button asChild variant="ghost" className="h-11 w-full">
              <Link href="/">Back to dashboard</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
