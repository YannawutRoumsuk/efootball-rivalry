"use client";

import { ArrowDown, ArrowUp, ChevronDown, Images, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/envelope";
import { emptyDraft, resolvePlayers, toSideInputs, type LeftOwner, type MatchDraft } from "@/lib/client/draft";
import { extractUpload, saveMatch } from "@/lib/client/matches";
import { prepareImageFile, uploadScreenshot } from "@/lib/client/upload";
import type { DuplicateCandidate } from "@/lib/domain/duplicates";
import type { PlayerKey, PlayerPair } from "@/lib/domain/types";
import { hasErrors, validateSides } from "@/lib/domain/validation";
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

export function BatchImport({ pair, me, aiEnabled }: { pair: PlayerPair; me: PlayerKey; aiEnabled: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [insertBefore, setInsertBefore] = useState("");
  const [importing, setImporting] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const myId = pair[me].id;

  const patch = (key: string, p: Partial<Item> | ((i: Item) => Partial<Item>)) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...(typeof p === "function" ? p(i) : p) } : i)));

  async function process(item: Item, file: File) {
    try {
      const prepared = await prepareImageFile(file);
      const up = await uploadScreenshot(prepared, () => undefined);
      patch(item.key, { uploadId: up.uploadId, duplicates: up.duplicates });
      if (!aiEnabled) {
        patch(item.key, { status: "ready", message: "AI not configured — enter stats manually.", open: true });
        return;
      }
      try {
        const res = await extractUpload(up.uploadId);
        patch(item.key, (i) => ({ status: "ready", draft: { ...i.draft, left: res.left, right: res.right }, message: null }));
      } catch (err) {
        patch(item.key, { status: "ready", open: true, message: `${err instanceof ApiError ? err.message : "AI failed"} — enter manually.` });
      }
    } catch (err) {
      patch(item.key, { status: "error", message: err instanceof ApiError ? err.message : "Upload failed." });
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = [...files].slice(0, MAX_FILES - items.length);
    if (files.length > list.length) toast.warning(`Only ${MAX_FILES} screenshots per batch.`);
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
    // Two at a time keeps phones responsive and respects AI rate limits.
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
    i.draft.leftOwner !== null &&
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
        const players = resolvePlayers(pair, myId, item.draft.leftOwner!);
        const outcome = await saveMatch(
          { upload_id: item.uploadId, played_on: item.draft.playedOn, sides: toSideInputs(item.draft, players), insert_at: position },
          item.acknowledged,
        );
        if (outcome.kind === "duplicate") {
          patch(item.key, { status: "duplicate", duplicates: outcome.duplicates, open: true, message: "Possible duplicate — confirm to import." });
          continue;
        }
        saved += 1;
        if (position !== null) position += 1;
        patch(item.key, { status: "saved", savedNo: outcome.result.matchNo, message: null, open: false });
      } catch (err) {
        patch(item.key, { status: "ready", message: err instanceof ApiError ? err.message : "Save failed." });
      }
    }
    setImporting(false);
    if (saved) toast.success(`Imported ${saved} ${saved === 1 ? "match" : "matches"}`);
  }

  return (
    <div className="space-y-5">
      <div className="panel flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="font-display font-semibold">Add historical screenshots</p>
          <p className="text-sm text-muted-foreground">Order the queue oldest → newest. Each match still needs its left side confirmed.</p>
        </div>
        <Button className="h-11" onClick={() => picker.current?.click()} disabled={items.length >= MAX_FILES}>
          <Images /> Choose screenshots
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
                pair={pair}
                me={me}
                myId={myId}
                onPatch={(p) => patch(item.key, p)}
                onMove={(d) => move(item.key, d)}
                onRemove={() => setItems((l) => l.filter((x) => x.key !== item.key))}
              />
            ))}
          </ol>

          <div className="panel sticky bottom-24 z-10 flex flex-col gap-3 p-4 sm:flex-row sm:items-end md:bottom-4">
            <div className="space-y-1">
              <Label htmlFor="insert-before" className="text-xs text-muted-foreground">Insert before match # (empty = append)</Label>
              <Input id="insert-before" type="number" inputMode="numeric" min={1} value={insertBefore} onChange={(e) => setInsertBefore(e.target.value)} className="h-10 w-40" />
            </div>
            <p className="flex-1 text-sm text-muted-foreground">
              {readyCount} of {pending.length} ready
            </p>
            <Button className="h-11" disabled={importing || readyCount === 0} onClick={importAll}>
              {importing && <Loader2 className="animate-spin" />} Import {readyCount} {readyCount === 1 ? "match" : "matches"}
            </Button>
          </div>
          {items.some((i) => i.status === "saved") && (
            <Link href="/matches" className="block text-center text-sm text-muted-foreground underline underline-offset-4">
              View match history
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function BatchRow({ item, index, total, pair, me, myId, onPatch, onMove, onRemove }: {
  item: Item;
  index: number;
  total: number;
  pair: PlayerPair;
  me: PlayerKey;
  myId: string;
  onPatch: (p: Partial<Item>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const d = item.draft;
  const issues = validateSides(d.left, d.right);
  const friend: PlayerKey = me === "a" ? "b" : "a";
  const players = d.leftOwner ? resolvePlayers(pair, myId, d.leftOwner) : null;
  const keyOf = (id: string): PlayerKey => (pair.a.id === id ? "a" : "b");
  const locked = item.status === "saved" || item.status === "saving" || item.status === "processing";

  return (
    <li className={cn("panel p-3 sm:p-4", item.status === "saved" && "opacity-60")}>
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
        <img src={item.preview} alt="" className="h-14 w-24 shrink-0 rounded-lg border object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">#{index + 1} · {item.name}</p>
          <p className="font-display text-xl font-bold tabular">
            {item.status === "processing" ? <Loader2 className="size-4 animate-spin" /> : `${d.left.goals ?? "?"} – ${d.right.goals ?? "?"}`}
          </p>
          {item.status === "saved" && <p className="text-xs text-success">Saved as match #{item.savedNo}</p>}
          {item.message && <p className={cn("text-xs", item.status === "error" ? "text-destructive" : "text-warning")}>{item.message}</p>}
        </div>
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
          <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={index === 0 || locked} onClick={() => onMove(-1)}><ArrowUp /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={index === total - 1 || locked} onClick={() => onMove(1)}><ArrowDown /></Button>
          <Button size="icon-sm" variant="ghost" aria-label="Remove" disabled={item.status === "saving" || item.status === "saved"} onClick={onRemove}><Trash2 /></Button>
        </div>
      </div>

      {!locked && item.status !== "error" && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Left side:</span>
            {(["me", "friend"] as LeftOwner[]).map((o) => {
              const k = o === "me" ? me : friend;
              return (
                <button
                  key={o}
                  type="button"
                  aria-pressed={d.leftOwner === o}
                  onClick={() => onPatch({ draft: { ...d, leftOwner: o } })}
                  className={cn(
                    "h-9 rounded-lg border-2 px-3 font-medium",
                    d.leftOwner === o ? (k === "a" ? "border-player-a bg-player-a/15" : "border-player-b bg-player-b/15") : "border-border text-muted-foreground",
                  )}
                >
                  {o === "me" ? "Me" : "Friend"} · {pair[k].display_name}
                </button>
              );
            })}
            <button type="button" onClick={() => onPatch({ open: !item.open })} className="ml-auto inline-flex h-9 items-center gap-1 text-muted-foreground hover:text-foreground">
              Review stats <ChevronDown className={cn("size-4 transition-transform", item.open && "rotate-180")} />
            </button>
          </div>
          {item.status === "duplicate" && (
            <div className="space-y-2">
              <DuplicateWarning duplicates={item.duplicates} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={item.acknowledged} onChange={(e) => onPatch({ acknowledged: e.target.checked })} />
                This is a different match — import it anyway
              </label>
            </div>
          )}
          {item.status === "ready" && item.duplicates.length > 0 && <DuplicateWarning duplicates={item.duplicates} />}
          {item.open && (
            <StatsEditor
              left={d.left}
              right={d.right}
              meta={
                players
                  ? {
                      left: { name: pair[keyOf(players.left)].display_name, playerKey: keyOf(players.left) },
                      right: { name: pair[keyOf(players.right)].display_name, playerKey: keyOf(players.right) },
                    }
                  : { left: null, right: null }
              }
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
