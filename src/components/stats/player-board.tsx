import { Fragment } from "react";
import { PlayerAvatar } from "@/components/player/player-avatar";
import { seatColor, seatStyle } from "@/components/player/seat-scope";
import { ELO, type EloPlayer } from "@/lib/domain/elo";
import { BOARD_STATS, leaders, LOWER_IS_BETTER, type PlayerBoardRow } from "@/lib/domain/player-stats";
import { fmt, pct } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";
import { cn } from "@/lib/utils";

interface PlayerBoardProps {
  rows: PlayerBoardRow[];
  elo: Map<string, EloPlayer>;
  meId: string | null;
}

interface Line {
  label: string;
  value: (r: PlayerBoardRow) => number | null;
  format: (v: number | null) => string;
  lowerIsBetter?: boolean;
  /** Decimals shown, so leaders are picked from what's on screen. */
  digits?: number;
  /** Rows like "games played" are context, not a contest. */
  noLeader?: boolean;
}

const avg = (v: number | null) => fmt(v, 1);
const rate = (v: number | null) => pct(v, 0);

/** Everyone side by side: per-game averages are fair even when players played different numbers of games. */
export async function PlayerBoard({ rows, elo, meId }: PlayerBoardProps) {
  const t = await getT();
  const sections: Array<{ title: string; lines: Line[] }> = [
    {
      title: t("board.overview"),
      lines: [
        { label: t("board.games"), value: (r) => r.games, format: (v) => fmt(v, 0), noLeader: true },
        { label: t("elo.col"), value: (r) => (r.games ? (elo.get(r.player.id)?.rating ?? ELO.start) : null), format: (v) => (v === null ? "—" : String(Math.round(v))), digits: 0 },
        { label: t("kpi.winRate"), value: (r) => r.winRate, format: rate, digits: 0 },
        { label: t("board.goalsFor"), value: (r) => r.goalsFor.average, format: avg },
        { label: t("board.goalsAgainst"), value: (r) => r.goalsAgainst.average, format: avg, lowerIsBetter: true },
        { label: t("board.cleanSheets"), value: (r) => (r.games ? (r.cleanSheets / r.games) * 100 : null), format: rate, digits: 0 },
      ],
    },
    {
      title: t("board.perGame"),
      lines: BOARD_STATS.map((k) => ({
        label: t(`stat.${k}` as MessageKey),
        value: (r: PlayerBoardRow) => r.stats[k].average,
        format: k === "possession_pct" ? rate : avg,
        digits: k === "possession_pct" ? 0 : 1,
        lowerIsBetter: LOWER_IS_BETTER.has(k),
      })),
    },
    {
      title: t("board.rates"),
      lines: [
        { label: t("cmp.accuracy"), value: (r) => r.shotAccuracy, format: rate, digits: 0 },
        { label: t("cmp.conversion"), value: (r) => r.conversion, format: rate, digits: 0 },
        { label: t("cmp.passCompletion"), value: (r) => r.passCompletion, format: rate, digits: 0 },
      ],
    },
  ];

  return (
    <section aria-labelledby="board-heading" className="panel overflow-hidden">
      <div className="px-4 pt-4 sm:px-6 sm:pt-5">
        <h2 id="board-heading" className="text-sm font-semibold">
          {t("board.title")}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("board.sub")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="mt-3 w-full min-w-[20rem] text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-[34%] py-2 pl-4 text-left text-xs font-medium text-muted-foreground sm:pl-6">
                <span className="sr-only">{t("board.stat")}</span>
              </th>
              {rows.map((r) => (
                <th key={r.player.id} scope="col" className="px-1 py-2 text-right last:pr-4 sm:last:pr-6" style={seatStyle(r.player.seat)}>
                  <span className="inline-flex flex-col items-end gap-1">
                    <PlayerAvatar name={r.player.display_name} avatarUrl={r.player.avatar_url} playerKey="a" size="sm" />
                    <span className="max-w-[6rem] truncate text-xs font-semibold" style={{ color: seatColor(r.player.seat) }}>
                      {r.player.display_name}
                      {r.player.id === meId && <span className="ml-1 font-normal text-muted-foreground">({t("common.you")})</span>}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => (
              <Fragment key={s.title}>
                <tr className="border-t bg-surface-2">
                  <th scope="colgroup" colSpan={rows.length + 1} className="py-1.5 pl-4 text-left text-xs font-medium text-muted-foreground sm:pl-6">
                    {s.title}
                  </th>
                </tr>
                {s.lines.map((line) => {
                  const values = rows.map(line.value);
                  const best = line.noLeader ? [] : leaders(values, line.lowerIsBetter, line.digits ?? 1);
                  return (
                    <tr key={line.label} className="border-t">
                      <th scope="row" className="py-2 pl-4 text-left text-xs font-normal text-muted-foreground sm:pl-6 sm:text-sm">
                        {line.label}
                      </th>
                      {rows.map((r, i) => {
                        const lead = best.includes(i);
                        return (
                          <td
                            key={r.player.id}
                            className={cn("px-1 py-2 text-right tabular last:pr-4 sm:last:pr-6", lead ? "font-semibold" : "text-foreground/80")}
                            style={lead ? { color: seatColor(r.player.seat) } : undefined}
                          >
                            {line.format(values[i])}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 py-3 text-xs text-muted-foreground sm:px-6">{t("board.note")}</p>
    </section>
  );
}
