"use client";

import { ArrowLeft, Check, Info, Keyboard, Loader2, RotateCcw, ScanText } from "lucide-react";
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
import { useT } from "@/lib/i18n/client";
import type { MessageKey, Params } from "@/lib/i18n/core";
import { errorText } from "@/lib/i18n/errors";
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
}

/** Kept as keys (not text) so switching language re-renders the note. */
interface ReadNote {
  tone: "ok" | "warn";
  key: MessageKey;
  params?: Params;
}

const STEPS: Array<{ id: Step; label: MessageKey }> = [
  { id: "pick", label: "upload.step.upload" },
  { id: "assign", label: "upload.step.sides" },
  { id: "review", label: "upload.step.review" },
  { id: "done", label: "upload.step.saved" },
];

export function UploadFlow({ roster, meId }: UploadFlowProps) {
  const t = useT();
  const [step, setStep] = useState<Step>("pick");
  const [phase, setPhase] = useState<Phase>("uploading");
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MatchDraft>(emptyDraft);
  const [aiNote, setAiNote] = useState<ReadNote | null>(null);
  const [suggested, setSuggested] = useState(false);
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
    // Keep "unreadable" notes from the reader only while the field is still empty.
    const stale = aiIssues.filter((i) => i.code === "unreadable" && i.side !== "match" && i.field && draft[i.side][i.field] === null);
    return [...live, ...stale];
  }, [draft, aiIssues]);

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setStep("pick");
    setPreview(null);
    setUploadId(null);
    setDraft(emptyDraft());
    setAiNote(null);
    setSuggested(false);
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

      setPhase("extracting");
      try {
        const res = await extractUpload(up.uploadId);
        const { leftPlayer, rightPlayer } = res.suggested;
        setDraft((d) => ({
          ...d,
          left: res.left,
          right: res.right,
          leftPlayer: leftPlayer ?? d.leftPlayer,
          rightPlayer: rightPlayer ?? d.rightPlayer,
        }));
        setSuggested(leftPlayer !== null || rightPlayer !== null);
        setAiIssues(res.issues);
        const scoreMissing = res.left.goals === null || res.right.goals === null;
        setAiNote(
          res.source === "ocr-partial" || scoreMissing
            ? { tone: "warn", key: "note.partial" }
            : { tone: "ok", key: res.source === "ocr" ? "note.ocr" : "note.ai" },
        );
      } catch (err) {
        setAiNote({ tone: "warn", key: "note.failed", params: { msg: errorText(err, t) } });
      }
      setStep("assign");
    } catch (err) {
      toast.error(err instanceof ApiError ? errorText(err, t) : t("upload.failed"));
      reset();
    }
  }

  function startManual() {
    setAiNote({ tone: "warn", key: "note.manual" });
    setStep("review");
  }

  function patchSide(side: ScreenSide, patch: Partial<DraftSide>) {
    setDraft((d) => ({ ...d, [side]: { ...d[side], ...patch } }));
  }

  async function save(acknowledge: boolean) {
    if (!chosen) {
      toast.error(t("upload.chooseSidesFirst"));
      return;
    }
    if (hasErrors(issues)) {
      toast.error(t("upload.fixErrors"));
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
      toast.success(t("upload.saved", { n: outcome.result.matchNo }));
    } catch (err) {
      toast.error(err instanceof ApiError ? errorText(err, t) : t("upload.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const activeIndex = STEPS.findIndex((s) => s.id === (step === "processing" ? "pick" : step === "duplicate" ? "review" : step));

  return (
    <div className="space-y-6">
      <ol className="flex items-center gap-2" aria-label={t("upload.progress")}>
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                i < activeIndex ? "bg-success/15 text-success" : i === activeIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
              aria-current={i === activeIndex ? "step" : undefined}
            >
              {i < activeIndex ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={`hidden text-sm sm:inline ${i === activeIndex ? "font-semibold" : "text-muted-foreground"}`}>{t(s.label)}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      {step === "pick" && (
        <div className="space-y-4">
          <ImagePicker onPick={onPick} />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <button type="button" onClick={startManual} className="inline-flex items-center gap-2 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              <Keyboard className="size-4" aria-hidden /> {t("upload.manual")}
            </button>
            <Link href="/upload/batch" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {t("upload.batchLink")}
            </Link>
          </div>
        </div>
      )}

      {step === "processing" && (
        <div className="panel flex flex-col items-center gap-5 px-6 py-12 text-center" aria-live="polite">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt={t("upload.selected")} className="max-h-56 rounded-xl border object-contain opacity-80" />
          )}
          <div className="flex items-center gap-2 text-lg font-semibold">
            {phase === "extracting" ? <ScanText className="size-5 animate-pulse text-muted-foreground" /> : <Loader2 className="size-5 animate-spin" />}
            {phase === "converting" ? t("upload.preparing") : phase === "uploading" ? t("upload.uploading", { p: progress }) : t("upload.reading")}
          </div>
          {phase === "uploading" && <Progress value={progress} className="h-2 w-full max-w-xs" />}
          {phase === "extracting" && <p className="max-w-xs text-sm text-muted-foreground">{t("upload.readingHint")}</p>}
        </div>
      )}

      {(step === "assign" || step === "review" || step === "duplicate") && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
          <aside className="space-y-3 lg:sticky lg:top-20">
            {preview ? (
              <ScreenshotViewer src={preview} />
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("upload.noShot")}</div>
            )}
            {aiNote && (
              <p className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${aiNote.tone === "ok" ? "bg-muted text-foreground" : "bg-warning/10 text-warning"}`}>
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t(aiNote.key, aiNote.params)}
              </p>
            )}
            {suggested && step === "assign" && (
              <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {t("note.suggested")}
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
                    <RotateCcw /> {t("upload.startOver")}
                  </Button>
                  <Button className="h-11 flex-1" disabled={!chosen} onClick={() => setStep("review")}>
                    {t("upload.confirmSides")}
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
                        {t("upload.backToReview")}
                      </Button>
                      <Button className="h-11 flex-1" disabled={saving} onClick={() => save(true)}>
                        {saving && <Loader2 className="animate-spin" />} {t("upload.saveAnyway")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" className="h-11" onClick={() => (preview ? setStep("assign") : reset())}>
                      <ArrowLeft /> {t("common.back")}
                    </Button>
                    <Button className="h-12 flex-1 text-base" disabled={saving || !chosen || hasErrors(issues)} onClick={() => save(false)}>
                      {saving && <Loader2 className="animate-spin" />} {t("upload.save")}
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
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/15">
            <Check className="size-7 text-success" aria-hidden />
          </span>
          <div>
            <h2 className="text-xl font-semibold">{t("upload.saved", { n: saved.matchNo })}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("upload.savedBody")}</p>
          </div>
          <RecordsCelebration records={saved.records} />
          <div className="flex flex-wrap gap-2">
            <Button className="h-11 flex-1" onClick={reset}>
              {t("upload.another")}
            </Button>
            <Button asChild variant="outline" className="h-11 flex-1">
              <Link href={`/matches/${saved.matchId}`}>{t("upload.viewMatch")}</Link>
            </Button>
            <Button asChild variant="ghost" className="h-11 w-full">
              <Link href="/">{t("upload.toDashboard")}</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
