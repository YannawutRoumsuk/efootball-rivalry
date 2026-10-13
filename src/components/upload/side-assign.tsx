"use client";

import { ArrowLeftRight } from "lucide-react";
import type { LeftOwner } from "@/lib/client/draft";
import type { PlayerKey, PlayerPair } from "@/lib/domain/types";
import type { DraftSide } from "@/lib/domain/validation";
import { cn } from "@/lib/utils";

interface SideAssignProps {
  left: DraftSide;
  right: DraftSide;
  pair: PlayerPair;
  me: PlayerKey;
  value: LeftOwner | null;
  onChange: (owner: LeftOwner) => void;
}

/** "Who was playing on the left side?" — the uploader must choose explicitly. */
export function SideAssign({ left, right, pair, me, value, onChange }: SideAssignProps) {
  const friend: PlayerKey = me === "a" ? "b" : "a";
  const options: Array<{ owner: LeftOwner; key: PlayerKey; title: string }> = [
    { owner: "me", key: me, title: "Me" },
    { owner: "friend", key: friend, title: "My friend" },
  ];
  const leftKey = value ? (value === "me" ? me : friend) : null;
  const rightKey = leftKey ? (leftKey === "a" ? "b" : "a") : null;
  const tone = (k: PlayerKey | null) => (k === "a" ? "text-player-a" : k === "b" ? "text-player-b" : "text-foreground");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border bg-surface-2/60 px-4 py-5 text-center">
        <div className="min-w-0">
          <p className="eyebrow">Left</p>
          <p className="truncate text-sm text-muted-foreground">{left.onscreen_label ?? "—"}</p>
          <p className={cn("font-display text-6xl font-bold tabular", tone(leftKey))}>{left.goals ?? "?"}</p>
          {leftKey && <p className={cn("truncate text-sm font-semibold", tone(leftKey))}>{pair[leftKey].display_name}</p>}
        </div>
        <ArrowLeftRight className="size-5 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="eyebrow">Right</p>
          <p className="truncate text-sm text-muted-foreground">{right.onscreen_label ?? "—"}</p>
          <p className={cn("font-display text-6xl font-bold tabular", tone(rightKey))}>{right.goals ?? "?"}</p>
          {rightKey && <p className={cn("truncate text-sm font-semibold", tone(rightKey))}>{pair[rightKey].display_name}</p>}
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-3 font-display text-lg font-semibold">Who was playing on the left side?</legend>
        <div className="grid grid-cols-2 gap-3" role="radiogroup">
          {options.map((o) => {
            const selected = value === o.owner;
            return (
              <button
                key={o.owner}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(o.owner)}
                className={cn(
                  "flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-3 transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]",
                  selected
                    ? o.key === "a"
                      ? "border-player-a bg-player-a/15"
                      : "border-player-b bg-player-b/15"
                    : "border-border hover:border-foreground/30",
                )}
              >
                <span className="font-display text-lg font-bold">{o.title}</span>
                <span className={cn("truncate text-sm", tone(o.key))}>{pair[o.key].display_name}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          On-screen names and teams change between matches, so the result is linked to real players only by this choice.
        </p>
      </fieldset>
    </div>
  );
}
