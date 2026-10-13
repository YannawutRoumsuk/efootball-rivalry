import type { MatchStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const STYLES: Record<MatchStatus, string> = {
  confirmed: "border-success/30 bg-success/10 text-success",
  disputed: "border-warning/40 bg-warning/12 text-warning",
  void: "border-border bg-muted text-muted-foreground line-through",
};

export function StatusBadge({ status, className }: { status: MatchStatus; className?: string }) {
  return (
    <span className={cn("rounded-md border px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wider uppercase", STYLES[status], className)}>
      {status}
    </span>
  );
}
