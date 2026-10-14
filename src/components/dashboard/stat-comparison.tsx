import type { RivalrySummary } from "@/lib/domain/stats";
import type { PlayerPair } from "@/lib/domain/types";
import { fmt, pct } from "@/lib/format";
import type { Translate } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

interface Row {
  label: string;
  a: number | null;
  b: number | null;
  format: (v: number | null) => string;
  /** Some stats (fouls) are better when lower; most are better when higher. */
  higherIsBetter?: boolean;
  hint?: string;
}

interface Group {
  title: string;
  tag: string;
  rows: Row[];
}

function groups(s: RivalrySummary, t: Translate): Group[] {
  const n = (v: number | null) => fmt(v, 1);
  const p = (v: number | null) => pct(v, 1);
  return [
    {
      title: t("cmp.totals"),
      tag: t("cmp.totalsTag"),
      rows: [
        { label: t("stat.goals"), a: s.a.goalsFor, b: s.b.goalsFor, format: n },
        { label: t("cmp.cleanSheets"), a: s.a.cleanSheets, b: s.b.cleanSheets, format: n },
        { label: t("stat.shots"), a: s.a.shots.samples ? s.a.shots.total : null, b: s.b.shots.samples ? s.b.shots.total : null, format: n },
      ],
    },
    {
      title: t("cmp.perMatch"),
      tag: t("cmp.perMatchTag"),
      rows: [
        { label: t("stat.goals"), a: s.a.avgGoalsFor, b: s.b.avgGoalsFor, format: n },
        { label: t("stat.possession_pct"), a: s.a.possession.average, b: s.b.possession.average, format: p },
        { label: t("stat.shots"), a: s.a.shots.average, b: s.b.shots.average, format: n },
        { label: t("stat.shots_on_target"), a: s.a.shotsOnTarget.average, b: s.b.shotsOnTarget.average, format: n },
        { label: t("stat.passes"), a: s.a.passes.average, b: s.b.passes.average, format: n },
        { label: t("stat.tackles"), a: s.a.tackles.average, b: s.b.tackles.average, format: n },
        { label: t("stat.interceptions"), a: s.a.interceptions.average, b: s.b.interceptions.average, format: n },
        { label: t("stat.saves"), a: s.a.saves.average, b: s.b.saves.average, format: n },
      ],
    },
    {
      title: t("cmp.rates"),
      tag: t("cmp.ratesTag"),
      rows: [
        { label: t("cmp.accuracy"), a: s.a.shotAccuracy, b: s.b.shotAccuracy, format: p, hint: t("cmp.accuracyHint") },
        { label: t("cmp.conversion"), a: s.a.conversionRate, b: s.b.conversionRate, format: p, hint: t("cmp.conversionHint") },
        { label: t("cmp.passCompletion"), a: s.a.passCompletion, b: s.b.passCompletion, format: p, hint: t("cmp.passCompletionHint") },
      ],
    },
  ];
}

function ComparisonRow({ row }: { row: Row }) {
  const { a, b } = row;
  const total = (a ?? 0) + (b ?? 0);
  const shareA = a !== null && b !== null && total > 0 ? (a / total) * 100 : 50;
  const better = a === null || b === null || a === b ? null : (a > b) === (row.higherIsBetter ?? true) ? "a" : "b";

  return (
    <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-3 py-2 sm:grid-cols-[4.5rem_1fr_4.5rem]">
      <span className={cn("text-base font-semibold tabular", better === "a" ? "text-player-a" : "text-foreground/80")}>
        {row.format(a)}
      </span>
      <div className="min-w-0">
        <p className="mb-1.5 text-center text-xs text-muted-foreground" title={row.hint}>
          {row.label}
        </p>
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted">
          {a !== null && b !== null && total > 0 ? (
            <>
              <div className={cn("h-full rounded-l-full bg-player-a", better !== "a" && "opacity-45")} style={{ width: `${shareA}%` }} />
              <div className={cn("h-full flex-1 rounded-r-full bg-player-b", better !== "b" && "opacity-45")} />
            </>
          ) : null}
        </div>
      </div>
      <span className={cn("text-right text-base font-semibold tabular", better === "b" ? "text-player-b" : "text-foreground/80")}>
        {row.format(b)}
      </span>
    </div>
  );
}

export async function StatComparison({ summary, pair }: { summary: RivalrySummary; pair: PlayerPair }) {
  const t = await getT();
  return (
    <section aria-labelledby="compare-heading" className="panel p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="compare-heading" className="text-sm font-semibold">
          {t("cmp.title")}
        </h2>
        <p className="flex gap-3 text-xs font-medium">
          <span className="truncate text-player-a">{pair.a.display_name}</span>
          <span className="truncate text-player-b">{pair.b.display_name}</span>
        </p>
      </div>
      <div className="space-y-4">
        {groups(summary, t).map((g) => (
          <div key={g.title}>
            <div className="mb-1 flex items-baseline gap-2 border-b pb-1.5">
              <h3 className="text-sm font-medium">{g.title}</h3>
              <span className="text-xs text-muted-foreground">{g.tag}</span>
            </div>
            {g.rows.map((r) => (
              <ComparisonRow key={`${g.title}-${r.label}`} row={r} />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t("cmp.note")}</p>
    </section>
  );
}
