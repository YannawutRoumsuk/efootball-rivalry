import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  compact?: boolean;
}

/** Two interlocking chevrons — one per player colour. */
export function Logo({ className, compact = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <path d="M4 6h10l6 10-6 10H4l6-10z" fill="var(--player-a)" />
        <path d="M28 6H18l-6 10 6 10h10l-6-10z" fill="var(--player-b)" opacity="0.9" />
      </svg>
      {!compact && (
        <span className="text-base leading-none font-semibold">Rivalry</span>
      )}
    </span>
  );
}
