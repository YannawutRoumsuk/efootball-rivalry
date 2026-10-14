"use client";

import { Expand } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

interface ScreenshotViewerProps {
  src: string;
  alt?: string;
  className?: string;
}

/** Thumbnail that opens the original screenshot full-screen (pinch-zoomable on iOS). */
export function ScreenshotViewer({ src, alt: altProp, className }: ScreenshotViewerProps) {
  const t = useT();
  const alt = altProp ?? t("viewer.alt");
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "group relative block w-full overflow-hidden rounded-xl border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            className,
          )}
          aria-label={t("viewer.open")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          <img src={src} alt={alt} className="max-h-[50vh] w-full object-contain" />
          <span className="absolute right-2 bottom-2 flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs text-white opacity-90 group-hover:opacity-100">
            <Expand className="size-3.5" aria-hidden /> {t("viewer.full")}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent className="h-[100dvh] max-h-none w-screen max-w-none rounded-none border-0 bg-black p-0 sm:max-w-none">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <div className="flex size-full items-center justify-center overflow-auto">
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
          <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
