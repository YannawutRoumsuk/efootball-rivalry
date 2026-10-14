import type { PlayerKey } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  name: string;
  avatarUrl?: string | null;
  playerKey: PlayerKey;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = {
  sm: "size-7 text-[0.65rem]",
  md: "size-10 text-sm",
  lg: "size-16 text-xl",
  xl: "size-20 text-2xl sm:size-24 sm:text-3xl",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const chars = parts.length === 1 ? [...parts[0]].slice(0, 2) : [[...parts[0]][0], [...parts[1]][0]];
  return chars.join("").toUpperCase();
}

export function PlayerAvatar({ name, avatarUrl, playerKey, size = "md", className }: PlayerAvatarProps) {
  const style =
    playerKey === "a"
      ? "bg-player-a/15 text-player-a"
      : "bg-player-b/15 text-player-b";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold",
        SIZES[size],
        style,
        className,
      )}
      aria-hidden
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary user avatar URL
        <img src={avatarUrl} alt="" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

export function playerText(key: "a" | "b" | "draw"): string {
  return key === "a" ? "text-player-a" : key === "b" ? "text-player-b" : "text-draw";
}

export function playerBg(key: "a" | "b" | "draw"): string {
  return key === "a" ? "bg-player-a" : key === "b" ? "bg-player-b" : "bg-draw";
}
