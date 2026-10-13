"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";

interface ImagePickerProps {
  onPick: (file: File) => void;
  disabled?: boolean;
}

/** Native iOS/Android photo picker + desktop drag-and-drop. */
export function ImagePicker({ onPick, disabled }: ImagePickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onPick(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-colors",
        dragging ? "border-player-a bg-player-a/10" : "border-border bg-card/60",
      )}
    >
      <span className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-player-a/30 to-player-b/30">
        <ImagePlus className="size-7" aria-hidden />
      </span>
      <p className="font-display text-xl font-bold">Upload the Full Time screenshot</p>
      <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
        The stats screen with both teams&apos; numbers. JPG, PNG, WEBP or HEIC up to 10 MB.
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-player-a px-6 font-semibold text-primary-foreground transition-transform hover:bg-player-a/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-[0.98] disabled:opacity-50"
      >
        Choose screenshot
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </div>
  );
}
