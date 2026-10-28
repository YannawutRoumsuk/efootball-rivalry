import { seatColor } from "@/components/player/seat-scope";
import { ELO, type EloPlayer } from "@/lib/domain/elo";
import { leaders, type BoardStat, type PlayerBoardRow } from "@/lib/domain/player-stats";
import { fmt, pct } from "@/lib/format";
import type { MessageKey, Translate } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";
import { PlayerBoard } from "./player-board";

interface Props {
  rows: PlayerBoardRow[];
  elo: Map<string, EloPlayer>;
  meId: string | null;
}

interface Metric {
  label: string;
  value: (r: PlayerBoardRow) => number | null;
  /** Games that recorded this stat (shown in the tooltip). */
  samples: (r: PlayerBoardRow) => number;
  /** Percentages share a 0–100 axis; everything else scales to the row's largest value. */
  percent?: boolean;
  lowerIsBetter?: boolean;
}

const stat = (t: Translate, k: BoardStat, extra: Partial<Metric> = {}): Metric => ({
  label: t(`stat.${k}` as MessageKey),
  value: (r) => r.stats[k].average,
  samples: (r) => r.stats[k].samples,
  percent: k === "possession_pct",
  ...extra,
});

/** One metric: a bar per player from a shared zero baseline, value labelled at the end. */
function MetricBars({ metric, rows, t }: { metric: Metric; rows: PlayerBoardRow[]; t: Translate }) {
  const values = rows.map(metric.value);
  const digits = metric.percent ? 0 : 1;
  const best = leaders(values, metric.lowerIsBetter, digits);
  const max = metric.percent ? 100 : Math.max(0, ...values.map((v) => v ?? 0));
  const show = (v: number | null) => (metric.percent ? pct(v, 0) : fmt(v, 1));
  return (
    <figure className="rounded-lg border p-3">
      <figcaption className="mb-2 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{metric.label}</span>
        {metric.lowerIsBetter && <span className="text-xs text-muted-foreground">{t("board.lowerBetter")}</span>}
      </figcaption>
      <ul className="space-y-1.5">
        {rows.map((r, i) => {
          const v = values[i];
          const width = v === null || max === 0 ? 0 : (v / max) * 100;
          const lead = best.includes(i);
          return (
            <li
              key={r.player.id}
              className="grid grid-cols-[4.25rem_1fr_2.75rem] items-center gap-2"
              title={t("board.tooltip", { name: r.player.display_name, stat: metric.label, value: show(v), n: metric.samples(r) })}
            >
              <span className="truncate text-xs text-muted-foreground">{r.player.display_name}</span>
              <span className="relative h-2" aria-hidden>
                {/* Thin bar from the zero baseline; only the data end is rounded. */}
                {v !== null && v > 0 && (
                  <span
                    className="absolute inset-y-0 left-0 min-w-[2px] rounded-r-[4px]"
                    style={{ width: `${width}%`, background: seatColor(r.player.seat) }}
                  />
                )}
              </span>
              <span className={cn("text-right text-xs tabular", lead ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {show(v)}
                {lead && <span className="sr-only"> ({t("board.best")})</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

/** The all-players board as charts: player tiles, then one small bar group per metric. */
export async function PlayerBoardVisual({ rows, elo, meId }: Props) {
  const t = await getT();
  const groups: Array<{ title: string; metrics: Metric[] }> = [
    {
      title: t("board.attack"),
      metrics: [
        { label: t("board.goalsFor"), value: (r) => r.goalsFor.average, samples: (r) => r.goalsFor.samples },
        stat(t, "shots"),
        stat(t, "shots_on_target"),
        { label: t("cmp.accuracy"), value: (r) => r.shotAccuracy, samples: (r) => r.stats.shots.samples, percent: true },
        { label: t("cmp.conversion"), value: (r) => r.conversion, samples: (r) => r.stats.shots.samples, percent: true },
        stat(t, "corners"),
        stat(t, "crosses"),
      ],
    },
    {
      title: t("board.possession"),
      metrics: [
        stat(t, "possession_pct"),
        stat(t, "passes"),
        stat(t, "successful_passes"),
        { label: t("cmp.passCompletion"), value: (r) => r.passCompletion, samples: (r) => r.stats.passes.samples, percent: true },
        stat(t, "free_kicks"),
      ],
    },
    {
      title: t("board.defence"),
      metrics: [
        { label: t("board.goalsAgainst"), value: (r) => r.goalsAgainst.average, samples: (r) => r.goalsAgainst.samples, lowerIsBetter: true },
        stat(t, "interceptions"),
        stat(t, "tackles"),
        stat(t, "saves"),
        { label: t("board.cleanSheets"), value: (r) => (r.games ? (r.cleanSheets / r.games) * 100 : null), samples: (r) => r.games, percent: true },
      ],
    },
    {
      title: t("board.discipline"),
      metrics: [stat(t, "fouls", { lowerIsBetter: true }), stat(t, "offsides", { lowerIsBetter: true })],
    },
  ];

  return (
    <section aria-labelledby="board-heading" className="panel space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="board-heading" className="text-sm font-semibold">
            {t("board.title")}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("board.sub")}</p>
        </div>
        {/* Legend: colour + name, so identity never relies on colour alone. */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={t("board.legend")}>
          {rows.map((r) => (
            <li key={r.player.id} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: seatColor(r.player.seat) }} aria-hidden />
              {r.player.display_name}
              {r.player.id === meId && <span className="text-muted-foreground">({t("common.you")})</span>}
            </li>
          ))}
        </ul>
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        {rows.map((r) => {
          const rating = elo.get(r.player.id) ?? { rating: ELO.start, games: 0, provisional: true, lastDelta: 0 };
          return (
            <li key={r.player.id} className="overflow-hidden rounded-lg border">
              <div className="h-1" style={{ background: seatColor(r.player.seat) }} aria-hidden />
              <div className="space-y-1 p-2.5 sm:p-3">
                <p className="truncate text-xs font-medium">{r.player.display_name}</p>
                <p className={cn("text-2xl leading-none font-semibold tabular", rating.provisional && "text-muted-foreground")}>
                  {Math.round(rating.rating)}
                </p>
                <p className="text-[0.7rem] text-muted-foreground">{rating.provisional ? t("elo.provisional") : t("elo.col")}</p>
                <dl className="grid grid-cols-2 gap-x-2 pt-1 text-[0.7rem] text-muted-foreground">
                  <dt>{t("board.games")}</dt>
                  <dd className="text-right text-foreground tabular">{r.games}</dd>
                  <dt>{t("board.winShort")}</dt>
                  <dd className="text-right text-foreground tabular">{pct(r.winRate, 0)}</dd>
                </dl>
              </div>
            </li>
          );
        })}
      </ul>

      {groups.map((g) => (
        <div key={g.title} className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">{g.title}</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {g.metrics.map((m) => (
              <MetricBars key={m.label} metric={m} rows={rows} t={t} />
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">{t("board.note")}</p>

      <details className="group rounded-lg border">
        <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground hover:text-foreground">{t("board.table")}</summary>
        <PlayerBoard rows={rows} elo={elo} meId={meId} bare />
      </details>
    </section>
  );
}
