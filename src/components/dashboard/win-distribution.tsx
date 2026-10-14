import type { RivalrySummary } from "@/lib/domain/stats";
import type { PlayerPair } from "@/lib/domain/types";
import { pct } from "@/lib/format";
import { getT } from "@/lib/i18n/server";

export async function WinDistribution({ summary, pair }: { summary: RivalrySummary; pair: PlayerPair }) {
  const t = await getT();
  const total = summary.totalMatches;
  const segments = [
    { key: "a", label: pair.a.display_name, count: summary.a.wins, className: "bg-player-a", text: "text-player-a" },
    { key: "draw", label: t("hero.draws"), count: summary.draws, className: "bg-draw/70", text: "text-draw" },
    { key: "b", label: pair.b.display_name, count: summary.b.wins, className: "bg-player-b", text: "text-player-b" },
  ];

  return (
    <section aria-labelledby="dist-heading" className="panel p-4 sm:p-6">
      <h2 id="dist-heading" className="mb-4 text-sm font-semibold">
        {t("dist.title")}
      </h2>
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.count}`).join(", ")}
      >
        {segments.map((s) =>
          s.count > 0 ? (
            <div
              key={s.key}
              className={`${s.className} h-full`}
              style={{ width: `${(s.count / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
        {segments.map((s, i) => (
          <div key={s.key} className={i === 1 ? "text-center" : i === 2 ? "text-right" : ""}>
            <dt className="truncate text-muted-foreground">{s.label}</dt>
            <dd className={`text-lg font-semibold tabular ${s.text}`}>
              {s.count} <span className="text-sm font-medium text-muted-foreground">· {pct(total ? (s.count / total) * 100 : null)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
