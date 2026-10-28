"use client";

import { AlertTriangle, OctagonX } from "lucide-react";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { seatColor } from "@/components/player/seat-scope";
import { STAT_KEYS, type ScreenSide, type StatKey } from "@/lib/domain/types";
import type { DraftSide, ValidationIssue } from "@/lib/domain/validation";
import { useT } from "@/lib/i18n/client";
import { issueText } from "@/lib/i18n/issues";
import { cn } from "@/lib/utils";

export interface SideMeta {
  name: string;
  seat: number;
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
        "tabular font-semibold",
        big ? "h-16 text-4xl" : "h-11 text-lg",
        align === "left" ? "text-left" : "text-right",
        issue?.severity === "warning" && "border-warning/60",
      )}
    />
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  const t = useT();
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
          <span>{issueText(i, t)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Shoot-out score. Shown when the score is level (or penalties are already
 * filled in, e.g. read from a "6 PK 7" screen); otherwise a small link opens it.
 */
function PenaltyRow({
  left,
  right,
  issue,
  onSideChange,
}: {
  left: DraftSide;
  right: DraftSide;
  issue?: ValidationIssue;
  onSideChange: (side: ScreenSide, patch: Partial<DraftSide>) => void;
}) {
  const t = useT();
  const filled = left.penalties != null || right.penalties != null;
  const level = left.goals !== null && left.goals === right.goals;
  const [open, setOpen] = useState(false);
  if (!filled && !level) return null;
  if (!filled && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        {t("editor.addPens")}
      </button>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-dashed px-3 py-2">
        <NumberCell align="left" label={t("editor.sideLabel", { side: t("common.Left"), stat: t("stat.penalties") })} value={left.penalties ?? null} issue={issue} onChange={(v) => onSideChange("left", { penalties: v })} />
        <span className="text-sm font-medium text-muted-foreground">{t("editor.pens")}</span>
        <NumberCell align="right" label={t("editor.sideLabel", { side: t("common.Right"), stat: t("stat.penalties") })} value={right.penalties ?? null} issue={issue} onChange={(v) => onSideChange("right", { penalties: v })} />
      </div>
      <p className="text-xs text-muted-foreground">{t("editor.pensHint")}</p>
    </div>
  );
}

/** Editable left | stat | right grid that mirrors the eFootball stats screen. */
export function StatsEditor({ left, right, meta, issues, playedOn, onSideChange, onPlayedOnChange }: StatsEditorProps) {
  const id = useId();
  const t = useT();
  const sideName = (side: ScreenSide) => t(side === "left" ? "common.Left" : "common.Right");
  const issueFor = (side: ScreenSide, field: StatKey | "goals") =>
    issues.find((i) => i.side === side && i.field === field && i.severity === "error") ??
    issues.find((i) => i.side === side && i.field === field);
  const tone = (side: ScreenSide) => (meta[side] ? { color: seatColor(meta[side]!.seat) } : undefined);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {(["left", "right"] as const).map((side) => {
          const d = side === "left" ? left : right;
          return (
            <div key={side} className={cn("space-y-2", side === "right" && "text-right")}>
              <p className="eyebrow" style={tone(side)}>
                {sideName(side)}
                {meta[side] ? ` · ${meta[side]!.name}` : ""}
              </p>
              <Label htmlFor={`${id}-${side}-label`} className={cn("text-xs text-muted-foreground", side === "right" && "justify-end")}>
                {t("editor.label")}
              </Label>
              <Input
                id={`${id}-${side}-label`}
                value={d.onscreen_label ?? ""}
                maxLength={60}
                onChange={(e) => onSideChange(side, { onscreen_label: e.target.value || null })}
                className={cn("h-11", side === "right" && "text-right")}
              />
              <Label htmlFor={`${id}-${side}-team`} className={cn("text-xs text-muted-foreground", side === "right" && "justify-end")}>
                {t("editor.team")}
              </Label>
              <Input
                id={`${id}-${side}-team`}
                value={d.team_name ?? ""}
                maxLength={60}
                placeholder={t("editor.teamPlaceholder")}
                onChange={(e) => onSideChange(side, { team_name: e.target.value || null })}
                className={cn("h-11", side === "right" && "text-right")}
              />
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border bg-surface-2 p-3">
        <NumberCell big align="left" label={t("editor.sideLabel", { side: sideName("left"), stat: t("stat.goals") })} value={left.goals} issue={issueFor("left", "goals")} onChange={(v) => onSideChange("left", { goals: v })} />
        <span className="text-sm font-medium text-muted-foreground">{t("editor.ft")}</span>
        <NumberCell big align="right" label={t("editor.sideLabel", { side: sideName("right"), stat: t("stat.goals") })} value={right.goals} issue={issueFor("right", "goals")} onChange={(v) => onSideChange("right", { goals: v })} />
      </div>

      <PenaltyRow left={left} right={right} issue={issues.find((i) => i.field === "penalties")} onSideChange={onSideChange} />

      <div className="space-y-1.5">
        {STAT_KEYS.map((key) => (
          <div key={key} className="grid grid-cols-[1fr_minmax(6.5rem,auto)_1fr] items-center gap-2 sm:gap-3">
            <NumberCell
              align="left"
              label={t("editor.sideLabel", { side: sideName("left"), stat: t(`stat.${key}`) })}
              decimal={key === "possession_pct"}
              value={left[key]}
              issue={issueFor("left", key)}
              onChange={(v) => onSideChange("left", { [key]: v })}
            />
            <span className="text-center text-xs leading-tight text-muted-foreground sm:text-sm">{t(`stat.${key}`)}</span>
            <NumberCell
              align="right"
              label={t("editor.sideLabel", { side: sideName("right"), stat: t(`stat.${key}`) })}
              decimal={key === "possession_pct"}
              value={right[key]}
              issue={issueFor("right", key)}
              onChange={(v) => onSideChange("right", { [key]: v })}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${id}-date`}>{t("editor.date")}</Label>
        <Input
          id={`${id}-date`}
          type="date"
          value={playedOn ?? ""}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => onPlayedOnChange(e.target.value || null)}
          className="h-11"
        />
        <p className="text-xs text-muted-foreground">{t("editor.dateHint")}</p>
      </div>

      <IssueList issues={issues} />
    </div>
  );
}
