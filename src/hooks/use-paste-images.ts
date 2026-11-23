"use client";

import { useEffect, useRef } from "react";

/** The parts of a clipboard DataTransfer we read (kept minimal so it is easy to test). */
export interface ClipboardLike {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<{ kind: string; type: string; getAsFile: () => File | null }> | null;
}

/**
 * Image files on the clipboard. A screenshot copied with Win+Shift+S or
 * "Copy image" arrives as an item; files copied in Explorer/Finder arrive as files.
 */
export function imagesFromClipboard(data: ClipboardLike | null | undefined): File[] {
  if (!data) return [];
  const files = Array.from(data.files ?? []).filter((f) => f.type.startsWith("image/"));
  if (files.length > 0) return files;
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null);
}

/**
 * Ctrl+V / ⌘V anywhere on the page hands pasted images to `onImages`.
 * Pasting text (into an input, say) is left alone.
 */
export function usePasteImages(onImages: (files: File[]) => void, enabled = true): void {
  const latest = useRef(onImages);
  useEffect(() => {
    latest.current = onImages;
  });
  useEffect(() => {
    if (!enabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = imagesFromClipboard(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      latest.current(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enabled]);
}
