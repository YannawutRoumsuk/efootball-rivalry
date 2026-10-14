"use client";

import { ImagePlus } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

interface ImagePickerProps {
  onPick: (file: File) => void;
  disabled?: boolean;
}

/** Native iOS/Android photo picker + desktop drag-and-drop. */
export function ImagePicker({ onPick, disabled }: ImagePickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const t = useT();

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
        "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
        dragging ? "border-foreground/40 bg-accent" : "border-border bg-card",
      )}
    >
      <span className="mb-5 flex size-14 items-center justify-center rounded-full bg-muted">
        <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
      </span>
      <p className="text-lg font-semibold">{t("picker.title")}</p>
      <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{t("picker.body")}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none active:scale-[0.98] disabled:opacity-50"
      >
        {t("picker.cta")}
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
