"use client";

import { Sigma } from "lucide-react";
import { Popover } from "radix-ui";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/core";
import { cn } from "@/lib/utils";

/** Every derived number on the site that has a "how is this calculated" note. */
export const FORMULAS = [
  "winRate",
  "cleanSheets",
  "average",
  "possession",
  "shotAccuracy",
  "conversion",
  "passCompletion",
  "dribbleSuccess",
  "elo",
  "avgPoints",
  "scoring",
  "winShare",
  "matchAccuracy",
  "lift",
  "radar",
  "outcomeSplit",
  "modes",
] as const;
export type FormulaId = (typeof FORMULAS)[number];

interface Props {
  id: FormulaId;
  /** Pin to the top-right corner of the nearest positioned parent. */
  corner?: boolean;
  className?: string;
}

/** A small Σ badge; tap or click it to see how the number next to it is worked out. */
export function FormulaHint({ id, corner = false, className }: Props) {
  const t = useT();
  const title = t(`formula.${id}.title` as MessageKey);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t("formula.aria", { name: title })}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border border-foreground/20 bg-muted align-middle text-foreground/70 shadow-xs transition-colors",
            "hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:border-foreground/50 data-[state=open]:text-foreground",
            corner && "absolute top-1.5 right-1.5 z-10",
            className,
          )}
        >
          <Sigma className="size-3" strokeWidth={2.5} aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={10}
          className="z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <p className="mb-1.5 flex items-center gap-1.5 font-semibold">
            <Sigma className="size-3.5 text-muted-foreground" aria-hidden />
            {title}
          </p>
          <p className="leading-relaxed whitespace-pre-line text-muted-foreground">{t(`formula.${id}` as MessageKey)}</p>
          <Popover.Arrow className="fill-popover" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
