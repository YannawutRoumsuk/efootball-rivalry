import type { MatchStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const STYLES: Record<MatchStatus, string> = {
  confirmed: "border-success/30 bg-success/10 text-success",
  disputed: "border-warning/40 bg-warning/12 text-warning",
  void: "border-border bg-muted text-muted-foreground line-through",
};

/** `label` is the translated status; the caller owns i18n so this stays usable from client and server code. */
export function StatusBadge({ status, label, className }: { status: MatchStatus; label: string; className?: string }) {
  return (
    <span className={cn("rounded-md border px-1.5 py-0.5 text-xs font-medium", STYLES[status], className)}>
      {label}
    </span>
  );
}
