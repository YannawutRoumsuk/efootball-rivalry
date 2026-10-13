import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** CSS colour for a seat (1-based). */
export function seatColor(seat: number): string {
  return `var(--seat-${((seat - 1) % 3) + 1})`;
}

/**
 * Re-points the "player A / player B" colour tokens at two seats, so every
 * head-to-head component renders in the right players' colours.
 */
export function pairStyle(seatA: number, seatB: number): CSSProperties {
  return {
    "--player-a": seatColor(seatA),
    "--player-b": seatColor(seatB),
  } as CSSProperties;
}

/** Same trick for a single player: anything styled as "player A" uses this seat's colour. */
export function seatStyle(seat: number): CSSProperties {
  return { "--player-a": seatColor(seat) } as CSSProperties;
}

export function PairScope({
  seats,
  children,
  className,
}: {
  seats: [number, number];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div style={pairStyle(seats[0], seats[1])} className={cn("contents", className)}>
      {children}
    </div>
  );
}
