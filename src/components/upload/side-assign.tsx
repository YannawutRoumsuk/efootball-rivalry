"use client";

import { ArrowLeftRight } from "lucide-react";
import { seatColor } from "@/components/player/seat-scope";
import type { RosterPlayer } from "@/lib/domain/league";
import type { DraftSide } from "@/lib/domain/validation";
import { useT } from "@/lib/i18n/client";
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
  const t = useT();
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
              "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border-2 px-2 py-2 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]",
              !selected && "border-border hover:border-foreground/30",
              disabled && "opacity-30",
            )}
          >
            <span className="max-w-full truncate text-base font-semibold" style={{ color: seatColor(p.seat) }}>
              {p.display_name}
            </span>
            {p.id === meId && <span className="text-xs text-muted-foreground">{t("common.you")}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** "Who played on each side?" — on-screen names may pre-select a player, but the uploader always confirms. */
export function SideAssign({ left, right, roster, meId, leftPlayer, rightPlayer, onChange }: SideAssignProps) {
  const byId = (id: string | null) => roster.find((p) => p.id === id) ?? null;
  const lp = byId(leftPlayer);
  const rp = byId(rightPlayer);
  const t = useT();

  const pickLeft = (id: string) => {
    const others = roster.filter((p) => p.id !== id);
    // With two players the other side is obvious; with three it stays the user's choice.
    const right = others.length === 1 ? others[0].id : rightPlayer === id ? null : rightPlayer;
    onChange({ leftPlayer: id, rightPlayer: right });
  };
  const pickRight = (id: string) => onChange({ leftPlayer, rightPlayer: id });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border bg-surface-2 px-4 py-5 text-center">
        {[
          { label: t("common.Left"), side: left, p: lp },
          null,
          { label: t("common.Right"), side: right, p: rp },
        ].map((col) =>
          col === null ? (
            <ArrowLeftRight key="mid" className="size-5 text-muted-foreground" aria-hidden />
          ) : (
            <div key={col.label} className="min-w-0">
              <p className="eyebrow">{col.label}</p>
              <p className="truncate text-sm text-muted-foreground">{col.side.onscreen_label ?? "—"}</p>
              <p className="text-5xl font-bold tabular" style={col.p ? { color: seatColor(col.p.seat) } : undefined}>
                {col.side.goals ?? "?"}
              </p>
              {col.side.penalties != null && <p className="text-xs font-medium text-muted-foreground tabular">{t("editor.pens")} {col.side.penalties}</p>}
              <p className="truncate text-sm font-semibold" style={col.p ? { color: seatColor(col.p.seat) } : undefined}>
                {col.p?.display_name ?? t("assign.who")}
              </p>
            </div>
          ),
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-base font-semibold">{t("assign.leftQ")}</legend>
        <PlayerButtons roster={roster} meId={meId} value={leftPlayer} disabledId={null} onPick={pickLeft} label={t("assign.leftPlayer")} />
      </fieldset>

      {roster.length > 2 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-base font-semibold">{t("assign.rightQ")}</legend>
          <PlayerButtons roster={roster} meId={meId} value={rightPlayer} disabledId={leftPlayer} onPick={pickRight} label={t("assign.rightPlayer")} />
        </fieldset>
      )}

      <p className="text-xs text-muted-foreground">{t("assign.note")}</p>
    </div>
  );
}
