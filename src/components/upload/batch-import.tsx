"use client";

import { ArrowDown, ArrowUp, ChevronDown, Images, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/envelope";
import { seatColor } from "@/components/player/seat-scope";
import { emptyDraft, playersChosen, toSideInputs, type MatchDraft } from "@/lib/client/draft";
import { extractUpload, saveMatch } from "@/lib/client/matches";
import { prepareImageFile, uploadScreenshot } from "@/lib/client/upload";
import type { DuplicateCandidate } from "@/lib/domain/duplicates";
import type { RosterPlayer } from "@/lib/domain/league";
import { hasErrors, validateSides } from "@/lib/domain/validation";
import { useT } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/errors";
import { cn } from "@/lib/utils";
import { DuplicateWarning } from "./duplicate-warning";
import { StatsEditor } from "./stats-editor";

type Status = "processing" | "ready" | "error" | "saving" | "saved" | "duplicate";

interface Item {
  key: string;
  name: string;
  preview: string;
  status: Status;
  message: string | null;
  uploadId: string | null;
  draft: MatchDraft;
  duplicates: DuplicateCandidate[];
  acknowledged: boolean;
  open: boolean;
  savedNo?: number;
}

const MAX_FILES = 30;

export function BatchImport({ roster, meId }: { roster: RosterPlayer[]; meId: string }) {
  const t = useT();
  const [items, setItems] = useState<Item[]>([]);
  const [insertBefore, setInsertBefore] = useState("");
  const [importing, setImporting] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const patch = (key: string, p: Partial<Item> | ((i: Item) => Partial<Item>)) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...(typeof p === "function" ? p(i) : p) } : i)));

  async function process(item: Item, file: File) {
    try {
      const prepared = await prepareImageFile(file);
      const up = await uploadScreenshot(prepared, () => undefined);
      patch(item.key, { uploadId: up.uploadId, duplicates: up.duplicates });
      try {
        const res = await extractUpload(up.uploadId);
        const partial = res.source === "ocr-partial" || res.left.goals === null || res.right.goals === null;
        patch(item.key, (i) => ({
          status: "ready",
          draft: {
            ...i.draft,
            left: res.left,
            right: res.right,
            leftPlayer: res.suggested.leftPlayer ?? i.draft.leftPlayer,
            rightPlayer: res.suggested.rightPlayer ?? i.draft.rightPlayer,
          },
          open: partial,
          message: partial ? t("note.partial") : null,
        }));
      } catch (err) {
        patch(item.key, { status: "ready", open: true, message: t("note.failed", { msg: errorText(err, t) }) });
      }
    } catch (err) {
      patch(item.key, { status: "error", message: err instanceof ApiError ? errorText(err, t) : t("upload.failed") });
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, MAX_FILES - items.length);
    if (files.length > list.length) toast.warning(t("batch.max", { n: MAX_FILES }));
    const created = list.map<Item>((f) => ({
      key: crypto.randomUUID(),
      name: f.name,
      preview: URL.createObjectURL(f),
      status: "processing",
      message: null,
      uploadId: null,
      draft: emptyDraft(),
      duplicates: [],
      acknowledged: false,
      open: false,
    }));
    setItems((cur) => [...cur, ...created]);
    // Two at a time keeps phones responsive and the server OCR queue short.
    let next = 0;
    const worker = async () => {
      while (next < created.length) {
        const idx = next++;
        await process(created[idx], list[idx]);
      }
    };
    await Promise.all([worker(), worker()]);
  }

  function move(key: string, dir: -1 | 1) {
    setItems((list) => {
      const i = list.findIndex((x) => x.key === key);
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  const pending = items.filter((i) => i.status !== "saved");
  const isReady = (i: Item) =>
    (i.status === "ready" || i.status === "duplicate") &&
    playersChosen(i.draft) &&
    !hasErrors(validateSides(i.draft.left, i.draft.right)) &&
    (i.status !== "duplicate" || i.acknowledged);
  const readyCount = pending.filter(isReady).length;

  async function importAll() {
    setImporting(true);
    let position = Number(insertBefore) > 0 ? Number(insertBefore) : null;
    let saved = 0;
    for (const item of items) {
      if (item.status === "saved" || !isReady(item)) continue;
      patch(item.key, { status: "saving" });
      try {
        const outcome = await saveMatch(
          { upload_id: item.uploadId, played_on: item.draft.playedOn, sides: toSideInputs(item.draft), insert_at: position },
          item.acknowledged,
        );
        if (outcome.kind === "duplicate") {
          patch(item.key, { status: "duplicate", duplicates: outcome.duplicates, open: true, message: t("batch.dupNote") });
          continue;
        }
        saved += 1;
        if (position !== null) position += 1;
        patch(item.key, { status: "saved", savedNo: outcome.result.matchNo, message: null, open: false });
      } catch (err) {
        patch(item.key, { status: "ready", message: err instanceof ApiError ? errorText(err, t) : t("upload.saveFailed") });
      }
    }
    setImporting(false);
    if (saved) toast.success(t("batch.imported", { n: saved }));
  }

  return (
    <div className="space-y-5">
      <div className="panel flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="font-semibold">{t("batch.add")}</p>
          <p className="text-sm text-muted-foreground">{t("batch.addBody")}</p>
        </div>
        <Button className="h-11" onClick={() => picker.current?.click()} disabled={items.length >= MAX_FILES}>
          <Images /> {t("batch.choose")}
        </Button>
        <input
          ref={picker}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <>
          <ol className="space-y-3">
            {items.map((item, idx) => (
              <BatchRow
                key={item.key}
                item={item}
                index={idx}
                total={items.length}
                roster={roster}
                meId={meId}
                onPatch={(p) => patch(item.key, p)}
                onMove={(d) => move(item.key, d)}
                onRemove={() => setItems((l) => l.filter((x) => x.key !== item.key))}
              />
            ))}
          </ol>

          <div className="panel sticky bottom-24 z-10 flex flex-col gap-3 p-4 sm:flex-row sm:items-end md:bottom-4">
            <div className="space-y-1">
              <Label htmlFor="insert-before" className="text-xs text-muted-foreground">
                {t("batch.insertBefore")}
              </Label>
              <Input id="insert-before" type="number" inputMode="numeric" min={1} value={insertBefore} onChange={(e) => setInsertBefore(e.target.value)} className="h-10 w-40" />
            </div>
            <p className="flex-1 text-sm text-muted-foreground">
              {t("batch.ready", { r: readyCount, n: pending.length })}
            </p>
            <Button className="h-11" disabled={importing || readyCount === 0} onClick={importAll}>
              {importing && <Loader2 className="animate-spin" />} {t("batch.import", { n: readyCount })}
            </Button>
          </div>
          {items.some((i) => i.status === "saved") && (
            <Link href="/matches" className="block text-center text-sm text-muted-foreground underline underline-offset-4">
              {t("batch.viewHistory")}
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function BatchRow({ item, index, total, roster, meId, onPatch, onMove, onRemove }: {
  item: Item;
  index: number;
  total: number;
  roster: RosterPlayer[];
  meId: string;
  onPatch: (p: Partial<Item>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const d = item.draft;
  const issues = validateSides(d.left, d.right);
  const metaFor = (id: string | null) => {
    const p = roster.find((r) => r.id === id);
    return p ? { name: p.display_name, seat: p.seat } : null;
  };
  const pick = (side: "leftPlayer" | "rightPlayer", id: string) => {
    const next = { ...d, [side]: id };
    const other = side === "leftPlayer" ? "rightPlayer" : "leftPlayer";
    if (next[other] === id) next[other] = null;
    // Two players: choosing one side settles the other.
    if (roster.length === 2) next[other] = roster.find((r) => r.id !== id)!.id;
    onPatch({ draft: next });
  };
  const locked = item.status === "saved" || item.status === "saving" || item.status === "processing";

  return (
    <li className={cn("panel p-3 sm:p-4", item.status === "saved" && "opacity-60")}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
        <img src={item.preview} alt="" className="h-14 w-24 shrink-0 rounded-lg border object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">#{index + 1} · {item.name}</p>
          <p className="text-lg font-semibold tabular">
            {item.status === "processing" ? <Loader2 className="size-4 animate-spin" /> : `${d.left.goals ?? "?"} – ${d.right.goals ?? "?"}${d.left.penalties != null && d.right.penalties != null ? ` (${t("pk.short", { l: d.left.penalties, r: d.right.penalties })})` : ""}`}
          </p>
          {item.status === "saved" && <p className="text-xs text-success">{t("batch.savedAs", { n: item.savedNo ?? "?" })}</p>}
          {item.message && <p className={cn("text-xs", item.status === "error" ? "text-destructive" : "text-warning")}>{item.message}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
          <Button size="icon-sm" variant="ghost" aria-label={t("batch.moveUp")} disabled={index === 0 || locked} onClick={() => onMove(-1)}><ArrowUp /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={t("batch.moveDown")} disabled={index === total - 1 || locked} onClick={() => onMove(1)}><ArrowDown /></Button>
          <Button size="icon-sm" variant="ghost" aria-label={t("batch.remove")} disabled={item.status === "saving" || item.status === "saved"} onClick={onRemove}><Trash2 /></Button>
        </div>
      </div>

      {!locked && item.status !== "error" && (
        <div className="mt-3 space-y-3">
          {(["leftPlayer", "rightPlayer"] as const).map((side) => (
            <div key={side} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-12 text-muted-foreground">{t(side === "leftPlayer" ? "common.Left" : "common.Right")}</span>
              {roster.map((p) => {
                const selected = d[side] === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => pick(side, p.id)}
                    style={selected ? { borderColor: seatColor(p.seat), background: `color-mix(in oklch, ${seatColor(p.seat)} 15%, transparent)` } : undefined}
                    className={cn("h-9 rounded-lg border-2 px-3 font-medium", !selected && "border-border text-muted-foreground")}
                  >
                    {p.display_name}
                    {p.id === meId ? ` (${t("common.you")})` : ""}
                  </button>
                );
              })}
            </div>
          ))}
          <button type="button" onClick={() => onPatch({ open: !item.open })} className="inline-flex h-9 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            {t("batch.review")} <ChevronDown className={cn("size-4 transition-transform", item.open && "rotate-180")} />
          </button>
          {item.status === "duplicate" && (
            <div className="space-y-2">
              <DuplicateWarning duplicates={item.duplicates} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={item.acknowledged} onChange={(e) => onPatch({ acknowledged: e.target.checked })} />
                {t("batch.differentMatch")}
              </label>
            </div>
          )}
          {item.status === "ready" && item.duplicates.length > 0 && <DuplicateWarning duplicates={item.duplicates} />}
          {item.open && (
            <StatsEditor
              left={d.left}
              right={d.right}
              meta={{ left: metaFor(d.leftPlayer), right: metaFor(d.rightPlayer) }}
              issues={issues}
              playedOn={d.playedOn}
              onSideChange={(side, p) => onPatch({ draft: { ...d, [side]: { ...d[side], ...p } } })}
              onPlayedOnChange={(v) => onPatch({ draft: { ...d, playedOn: v } })}
            />
          )}
        </div>
      )}
    </li>
  );
}
