"use client";

import { AlertTriangle, OctagonX } from "lucide-react";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STAT_KEYS, STAT_LABELS, type PlayerKey, type ScreenSide, type StatKey } from "@/lib/domain/types";
import type { DraftSide, ValidationIssue } from "@/lib/domain/validation";
import { cn } from "@/lib/utils";

export interface SideMeta {
  name: string;
  playerKey: PlayerKey;
}

interface StatsEditorProps {
  left: DraftSide;
  right: DraftSide;
  meta: Record<ScreenSide, SideMeta | null>;
  issues: ValidationIssue[];
  playedOn: string | null;
  onSideChange: (side: ScreenSide, patch: Partial<DraftSide>) => void;
  onPlayedOnChange: (value: string | null) => void;
}

function NumberCell({
  value,
  onChange,
  label,
  decimal = false,
  issue,
  big = false,
  align,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  decimal?: boolean;
  issue?: ValidationIssue;
  big?: boolean;
  align: "left" | "right";
}) {
  return (
    <Input
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      enterKeyHint="next"
      aria-label={label}
      aria-invalid={issue?.severity === "error" || undefined}
      value={value ?? ""}
      placeholder="—"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".").replace(decimal ? /[^0-9.]/g : /[^0-9]/g, "");
        onChange(raw === "" ? null : Number(raw));
      }}
      className={cn(
        "tabular font-display font-semibold",
        big ? "h-16 text-4xl" : "h-11 text-lg",
        align === "left" ? "text-left" : "text-right",
        issue?.severity === "warning" && "border-warning/60",
      )}
    />
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-1.5" aria-live="polite">
      {issues.map((i, idx) => (
        <li
          key={`${i.side}-${i.field}-${idx}`}
          className={cn(
            "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
            i.severity === "error" ? "bg-destructive/12 text-destructive" : "bg-warning/10 text-warning",
          )}
        >
          {i.severity === "error" ? (
            <OctagonX className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}

/** Editable left | stat | right grid that mirrors the eFootball stats screen. */
export function StatsEditor({ left, right, meta, issues, playedOn, onSideChange, onPlayedOnChange }: StatsEditorProps) {
  const id = useId();
  const issueFor = (side: ScreenSide, field: StatKey | "goals") =>
    issues.find((i) => i.side === side && i.field === field && i.severity === "error") ??
    issues.find((i) => i.side === side && i.field === field);
  const tone = (side: ScreenSide) =>
    meta[side]?.playerKey === "a" ? "text-player-a" : meta[side]?.playerKey === "b" ? "text-player-b" : "text-muted-foreground";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {(["left", "right"] as const).map((side) => {
          const d = side === "left" ? left : right;
          return (
            <div key={side} className={cn("space-y-2", side === "right" && "text-right")}>
              <p className={cn("eyebrow", tone(side))}>
                {side}{meta[side] ? ` · ${meta[side]!.name}` : ""}
              </p>
              <Label htmlFor={`${id}-${side}-label`} className={cn("text-xs text-muted-foreground", side === "right" && "justify-end")}>
                On-screen label
              </Label>
              <Input
                id={`${id}-${side}-label`}
                value={d.onscreen_label ?? ""}
                maxLength={60}
                onChange={(e) => onSideChange(side, { onscreen_label: e.target.value || null })}
                className={cn("h-11", side === "right" && "text-right")}
              />
              <Label htmlFor={`${id}-${side}-team`} className={cn("text-xs text-muted-foreground", side === "right" && "justify-end")}>
                Team used (optional)
              </Label>
              <Input
                id={`${id}-${side}-team`}
                value={d.team_name ?? ""}
                maxLength={60}
                placeholder="e.g. Arsenal"
                onChange={(e) => onSideChange(side, { team_name: e.target.value || null })}
                className={cn("h-11", side === "right" && "text-right")}
              />
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border bg-surface-2/60 p-3">
        <NumberCell big align="left" label="Left goals" value={left.goals} issue={issueFor("left", "goals")} onChange={(v) => onSideChange("left", { goals: v })} />
        <span className="font-display text-sm font-semibold tracking-widest text-muted-foreground">FT</span>
        <NumberCell big align="right" label="Right goals" value={right.goals} issue={issueFor("right", "goals")} onChange={(v) => onSideChange("right", { goals: v })} />
      </div>

      <div className="space-y-1.5">
        {STAT_KEYS.map((key) => (
          <div key={key} className="grid grid-cols-[1fr_minmax(6.5rem,auto)_1fr] items-center gap-2 sm:gap-3">
            <NumberCell
              align="left"
              label={`Left ${STAT_LABELS[key]}`}
              decimal={key === "possession_pct"}
              value={left[key]}
              issue={issueFor("left", key)}
              onChange={(v) => onSideChange("left", { [key]: v })}
            />
            <span className="text-center text-xs leading-tight text-muted-foreground sm:text-sm">{STAT_LABELS[key]}</span>
            <NumberCell
              align="right"
              label={`Right ${STAT_LABELS[key]}`}
              decimal={key === "possession_pct"}
              value={right[key]}
              issue={issueFor("right", key)}
              onChange={(v) => onSideChange("right", { [key]: v })}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${id}-date`}>Match date (optional)</Label>
        <Input
          id={`${id}-date`}
          type="date"
          value={playedOn ?? ""}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => onPlayedOnChange(e.target.value || null)}
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">Leave empty if unknown — upload time is never used as the match date.</p>
      </div>

      <IssueList issues={issues} />
    </div>
  );
}
