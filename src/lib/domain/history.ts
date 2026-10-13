import { sortChronologically, toPerspective } from "./match";
import type { Match, PlayerPair } from "./types";

export type HistoryFilter =
  | "all"
  | "last5"
  | "last10"
  | "a_wins"
  | "b_wins"
  | "draws"
  | "high_scoring";

export const HISTORY_FILTERS: readonly HistoryFilter[] = [
  "all",
  "last5",
  "last10",
  "a_wins",
  "b_wins",
  "draws",
  "high_scoring",
];

export interface HistoryQuery {
  filter: HistoryFilter;
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
  const filter = HISTORY_FILTERS.includes(get("filter") as HistoryFilter)
    ? (get("filter") as HistoryFilter)
    : "all";
  const page = Math.max(1, Number.parseInt(get("page") ?? "1", 10) || 1);
  const from = get("from");
  const to = get("to");
  return {
    filter,
    from: from && DATE_RE.test(from) ? from : null,
    to: to && DATE_RE.test(to) ? to : null,
    includeVoid: get("void") === "1",
    page,
    pageSize: 20,
  };
}

function inDateRange(match: Match, from: string | null, to: string | null): boolean {
  if (!from && !to) return true;
  if (!match.played_at) return false;
  const day = match.played_at.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}

/**
 * Filters the full match list for the history page. Newest first, except the
 * "highest-scoring" view which sorts by total goals.
 */
export function queryHistory(matches: readonly Match[], pair: PlayerPair, q: HistoryQuery): HistoryPage {
  let list = sortChronologically(matches)
    .filter((m) => q.includeVoid || m.status !== "void")
    .filter((m) => inDateRange(m, q.from, q.to));

  const winnerIs = (m: Match, w: "a" | "b" | "draw") =>
    m.status !== "void" && toPerspective(m, pair).winner === w;

  switch (q.filter) {
    case "last5":
      list = list.slice(-5);
      break;
    case "last10":
      list = list.slice(-10);
      break;
    case "a_wins":
      list = list.filter((m) => winnerIs(m, "a"));
      break;
    case "b_wins":
      list = list.filter((m) => winnerIs(m, "b"));
      break;
    case "draws":
      list = list.filter((m) => winnerIs(m, "draw"));
      break;
    default:
      break;
  }

  const ordered =
    q.filter === "high_scoring"
      ? [...list].sort(
          (x, y) =>
            y.sides[0].goals + y.sides[1].goals - (x.sides[0].goals + x.sides[1].goals) ||
            y.match_no - x.match_no,
        )
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
