import { involves, outcomeOf, type Roster } from "./league";
import { sortChronologically, winnerPlayerId } from "./match";
import type { Match } from "./types";

export type HistoryFilter = "all" | "last5" | "last10" | "draws" | "high_scoring";

export const HISTORY_FILTERS: readonly HistoryFilter[] = ["all", "last5", "last10", "draws", "high_scoring"];

export interface HistoryQuery {
  filter: HistoryFilter;
  /** Seat number: only matches this player played in. */
  player: number | null;
  /** With `player`: only that player's wins. */
  winsOnly: boolean;
  from: string | null;
  to: string | null;
  includeVoid: boolean;
  page: number;
  pageSize: number;
}

export interface HistoryPage {
  items: Match[];
  total: number;
  page: number;
  pageCount: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseHistoryQuery(params: Record<string, string | string[] | undefined>): HistoryQuery {
  const get = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const filter = HISTORY_FILTERS.includes(get("filter") as HistoryFilter) ? (get("filter") as HistoryFilter) : "all";
  const seat = Number.parseInt(get("player") ?? "", 10);
  const from = get("from");
  const to = get("to");
  return {
    filter,
    player: Number.isInteger(seat) && seat > 0 ? seat : null,
    winsOnly: get("wins") === "1",
    from: from && DATE_RE.test(from) ? from : null,
    to: to && DATE_RE.test(to) ? to : null,
    includeVoid: get("void") === "1",
    page: Math.max(1, Number.parseInt(get("page") ?? "1", 10) || 1),
    pageSize: 20,
  };
}

function inDateRange(match: Match, from: string | null, to: string | null): boolean {
  if (!from && !to) return true;
  if (!match.played_at) return false;
  const day = match.played_at.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}

const totalGoals = (m: Match) => m.sides[0].goals + m.sides[1].goals;

/**
 * Filters the match list for the history page. Newest first, except the
 * "highest-scoring" view which sorts by total goals.
 */
export function queryHistory(matches: readonly Match[], roster: Roster, q: HistoryQuery): HistoryPage {
  const player = q.player === null ? null : roster.find((p) => p.seat === q.player) ?? null;

  let list = sortChronologically(matches)
    .filter((m) => q.includeVoid || m.status !== "void")
    .filter((m) => inDateRange(m, q.from, q.to))
    .filter((m) => !player || involves(m, player.id))
    .filter((m) => !player || !q.winsOnly || (m.status !== "void" && outcomeOf(m, player.id) === "W"));

  if (q.filter === "last5") list = list.slice(-5);
  else if (q.filter === "last10") list = list.slice(-10);
  else if (q.filter === "draws") list = list.filter((m) => m.status !== "void" && winnerPlayerId(m) === null);

  const ordered =
    q.filter === "high_scoring"
      ? [...list].sort((x, y) => totalGoals(y) - totalGoals(x) || y.match_no - x.match_no)
      : [...list].reverse();

  const pageCount = Math.max(1, Math.ceil(ordered.length / q.pageSize));
  const page = Math.min(q.page, pageCount);
  return {
    items: ordered.slice((page - 1) * q.pageSize, page * q.pageSize),
    total: ordered.length,
    page,
    pageCount,
  };
}
