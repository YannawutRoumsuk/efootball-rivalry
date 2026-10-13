"use client";

import { ArrowLeftRight } from "lucide-react";
import { seatColor } from "@/components/player/seat-scope";
import type { RosterPlayer } from "@/lib/domain/league";
import type { DraftSide } from "@/lib/domain/validation";
import { cn } from "@/lib/utils";

interface SideAssignProps {
  left: DraftSide;
  right: DraftSide;
  roster: readonly RosterPlayer[];
  meId: string;
  leftPlayer: string | null;
  rightPlayer: string | null;
  onChange: (next: { leftPlayer: string | null; rightPlayer: string | null }) => void;
}

function PlayerButtons({
  roster,
  meId,
  value,
  disabledId,
  onPick,
  label,
}: {
  roster: readonly RosterPlayer[];
  meId: string;
  value: string | null;
  disabledId: string | null;
  onPick: (id: string) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("grid gap-2", roster.length >= 3 ? "grid-cols-3" : "grid-cols-2")}>
      {roster.map((p) => {
        const selected = value === p.id;
        const disabled = disabledId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onPick(p.id)}
            style={selected ? { borderColor: seatColor(p.seat), background: `color-mix(in oklch, ${seatColor(p.seat)} 15%, transparent)` } : undefined}
            className={cn(
              "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-2 py-2 transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]",
              !selected && "border-border hover:border-foreground/30",
              disabled && "opacity-30",
            )}
          >
            <span className="max-w-full truncate font-display text-base font-bold" style={{ color: seatColor(p.seat) }}>
              {p.display_name}
            </span>
            {p.id === meId && <span className="text-[0.65rem] text-muted-foreground uppercase">You</span>}
          </button>
        );
      })}
    </div>
  );
}

/** "Who played on each side?" — the uploader must choose; names on screen are never trusted. */
export function SideAssign({ left, right, roster, meId, leftPlayer, rightPlayer, onChange }: SideAssignProps) {
  const byId = (id: string | null) => roster.find((p) => p.id === id) ?? null;
  const lp = byId(leftPlayer);
  const rp = byId(rightPlayer);

  const pickLeft = (id: string) => {
    const others = roster.filter((p) => p.id !== id);
    // With two players the other side is obvious; with three it stays the user's choice.
    const right = others.length === 1 ? others[0].id : rightPlayer === id ? null : rightPlayer;
    onChange({ leftPlayer: id, rightPlayer: right });
  };
  const pickRight = (id: string) => onChange({ leftPlayer, rightPlayer: id });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border bg-surface-2/60 px-4 py-5 text-center">
        {[
          { label: "Left", side: left, p: lp },
          null,
          { label: "Right", side: right, p: rp },
        ].map((col, i) =>
          col === null ? (
            <ArrowLeftRight key="mid" className="size-5 text-muted-foreground" aria-hidden />
          ) : (
            <div key={col.label} className="min-w-0">
              <p className="eyebrow">{col.label}</p>
              <p className="truncate text-sm text-muted-foreground">{col.side.onscreen_label ?? "—"}</p>
              <p className="font-display text-6xl font-bold tabular" style={col.p ? { color: seatColor(col.p.seat) } : undefined}>
                {col.side.goals ?? "?"}
              </p>
              <p className="truncate text-sm font-semibold" style={col.p ? { color: seatColor(col.p.seat) } : undefined}>
                {col.p?.display_name ?? (i === 0 ? "Who?" : "Who?")}
              </p>
            </div>
          ),
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 font-display text-lg font-semibold">Who played on the LEFT side?</legend>
        <PlayerButtons roster={roster} meId={meId} value={leftPlayer} disabledId={null} onPick={pickLeft} label="Left player" />
      </fieldset>

      {roster.length > 2 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 font-display text-lg font-semibold">…and on the RIGHT side?</legend>
          <PlayerButtons roster={roster} meId={meId} value={rightPlayer} disabledId={leftPlayer} onPick={pickRight} label="Right player" />
        </fieldset>
      )}

      <p className="text-xs text-muted-foreground">
        On-screen names and teams change between matches, so the result is linked to real players only by this choice.
      </p>
    </div>
  );
}
