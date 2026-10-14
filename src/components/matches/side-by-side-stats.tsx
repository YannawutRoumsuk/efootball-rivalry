import { STAT_KEYS, type MatchSide, type PlayerKey } from "@/lib/domain/types";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

interface Props {
  left: MatchSide;
  right: MatchSide;
  leftKey: PlayerKey;
  rightKey: PlayerKey;
}

const tone = (k: PlayerKey) => (k === "a" ? "bg-player-a" : "bg-player-b");
const text = (k: PlayerKey) => (k === "a" ? "text-player-a" : "text-player-b");

/** Full-time stats laid out exactly like the in-game screen: left | stat | right. */
export async function SideBySideStats({ left, right, leftKey, rightKey }: Props) {
  const t = await getT();
  return (
    <dl className="divide-y">
      {STAT_KEYS.map((key) => {
        const l = left[key];
        const r = right[key];
        const total = (l ?? 0) + (r ?? 0);
        const lShare = l !== null && r !== null && total > 0 ? (l / total) * 100 : null;
        const suffix = key === "possession_pct" ? "%" : "";
        return (
          <div key={key} className="py-2.5">
            <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2">
              <dd className={cn("text-base font-semibold tabular", l !== null && r !== null && l > r && text(leftKey))}>
                {l === null ? "—" : `${l}${suffix}`}
              </dd>
              <dt className="text-center text-xs text-muted-foreground sm:text-sm">{t(`stat.${key}`)}</dt>
              <dd className={cn("text-right text-base font-semibold tabular", l !== null && r !== null && r > l && text(rightKey))}>
                {r === null ? "—" : `${r}${suffix}`}
              </dd>
            </div>
            {lShare !== null && (
              <div className="mt-1.5 flex h-1 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                <div className={cn("h-full rounded-l-full", tone(leftKey))} style={{ width: `${lShare}%` }} />
                <div className={cn("h-full flex-1 rounded-r-full", tone(rightKey))} />
              </div>
            )}
          </div>
        );
      })}
    </dl>
  );
}
