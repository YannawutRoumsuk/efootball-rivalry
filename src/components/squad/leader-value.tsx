import { Crown } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { seatColor } from "@/components/player/seat-scope";
import { cn } from "@/lib/utils";

/**
 * The best value in a comparison, highlighted exactly like the stats board:
 * a pill in the player's seat colour with a crown and the glowing sweep.
 */
export function LeaderValue({ seat, children, className, title }: { seat: number; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn("leader-bar relative inline-flex items-center gap-1 overflow-hidden rounded px-1.5 py-0.5 font-bold", className)}
      style={{ background: seatColor(seat), color: "var(--on-seat)", "--glow": seatColor(seat) } as CSSProperties}
    >
      <Crown className="size-3 shrink-0" aria-hidden />
      {children}
    </span>
  );
}
