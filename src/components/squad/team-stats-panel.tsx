import { STAT_KEYS } from "@/lib/domain/types";
import type { TeamStats } from "@/lib/domain/squad";
import type { MessageKey, Translate } from "@/lib/i18n/core";
import { cn } from "@/lib/utils";

const US = "var(--seat-1)";
const THEM = "var(--muted-foreground)";

/** The Full Time screen of a 3v3 match: our team | stat | opponents, with a share bar. */
export function TeamStatsPanel({ stats, us, them, t }: { stats: TeamStats; us: string; them: string; t: Translate }) {
  return (
    <section className="panel p-4">
      <h2 className="text-sm font-semibold">{t("squad.ft.title")}</h2>
      <div className="mt-2 mb-1 grid grid-cols-[3.5rem_1fr_3.5rem] text-xs font-semibold">
        <span className="truncate" style={{ color: US }}>
          {us}
        </span>
        <span />
        <span className="truncate text-right text-muted-foreground">{them}</span>
      </div>
      <dl className="divide-y">
        {STAT_KEYS.map((key) => {
          const l = stats.us[key] ?? null;
          const r = stats.them[key] ?? null;
          if (l === null && r === null) return null;
          const total = (l ?? 0) + (r ?? 0);
          const share = l !== null && r !== null && total > 0 ? (l / total) * 100 : null;
          const suffix = key === "possession_pct" ? "%" : "";
          return (
            <div key={key} className="py-2">
              <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2">
                <dd className={cn("font-semibold tabular", l !== null && r !== null && l > r && "text-[var(--seat-1)]")}>{l === null ? "—" : `${l}${suffix}`}</dd>
                <dt className="text-center text-xs text-muted-foreground">{t(`stat.${key}` as MessageKey)}</dt>
                <dd className={cn("text-right font-semibold tabular", l !== null && r !== null && r > l && "text-foreground")}>{r === null ? "—" : `${r}${suffix}`}</dd>
              </div>
              {share !== null && (
                <div className="mt-1 flex h-1 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                  <div className="h-full rounded-l-full" style={{ width: `${share}%`, background: US }} />
                  <div className="h-full flex-1 rounded-r-full opacity-40" style={{ background: THEM }} />
                </div>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
