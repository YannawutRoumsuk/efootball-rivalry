import { X } from "lucide-react";
import type { AwardTier, SquadAward } from "@/lib/domain/squad";
import { cn } from "@/lib/utils";

/** Same three pill colours as the in-game Co-op Awards screen. */
const TIER_STYLE: Record<AwardTier, string> = {
  gold: "bg-gradient-to-r from-orange-500 to-amber-400 text-white shadow-[0_0_10px_-2px] shadow-amber-400/70",
  silver: "bg-gradient-to-r from-slate-500 to-sky-300/80 text-white",
  bronze: "bg-gradient-to-r from-amber-900 to-amber-700 text-amber-50",
};

export function AwardChip({ award, size = "sm", onRemove, removeLabel }: { award: SquadAward; size?: "xs" | "sm"; onRemove?: () => void; removeLabel?: string }) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full font-semibold whitespace-nowrap",
        size === "xs" ? "px-1.5 py-0.5 text-[0.65rem]" : "px-2.5 py-0.5 text-xs",
        TIER_STYLE[award.tier],
      )}
    >
      <span className="truncate">{award.title}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={removeLabel} className="-mr-1 rounded-full p-0.5 hover:bg-black/20">
          <X className="size-3" aria-hidden />
        </button>
      )}
    </span>
  );
}

export function AwardList({ awards, size = "sm", className }: { awards: readonly SquadAward[] | undefined; size?: "xs" | "sm"; className?: string }) {
  if (!awards || awards.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {awards.map((a, i) => (
        <AwardChip key={`${a.title}-${i}`} award={a} size={size} />
      ))}
    </span>
  );
}

const TIER_RANK: Record<AwardTier, number> = { gold: 0, silver: 1, bronze: 2 };

/** Every title a player has collected, most frequent (then best tier) first. */
export function tallyAwards(lists: ReadonlyArray<readonly SquadAward[] | undefined>): Array<SquadAward & { count: number }> {
  const map = new Map<string, SquadAward & { count: number }>();
  for (const list of lists) {
    for (const a of list ?? []) {
      const key = `${a.title.toLowerCase()}|${a.tier}`;
      const prev = map.get(key);
      map.set(key, { ...a, count: (prev?.count ?? 0) + 1 });
    }
  }
  return [...map.values()].sort((x, y) => y.count - x.count || TIER_RANK[x.tier] - TIER_RANK[y.tier] || x.title.localeCompare(y.title));
}
