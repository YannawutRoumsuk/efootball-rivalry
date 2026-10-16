import type { Match } from "./types";

/**
 * Seasons are calendar quarters in Bangkok time ("2026-Q4"). Everything recorded
 * before the group switched seasons on (`epoch`) is the pre-season ("pre"),
 * kept for history but separate from the new tables. Nothing is ever deleted:
 * a season is just a filter over the same matches.
 */
export type SeasonKey = "pre" | `${number}-Q${1 | 2 | 3 | 4}`;
export type Scope = SeasonKey | "all";

export interface Season {
  key: SeasonKey;
  /** 0 for the pre-season, 1 for the first quarter after the cut-over, … */
  number: number;
  current: boolean;
  /** ISO bounds; `startsAt` is null for the pre-season (it has no beginning). */
  startsAt: string | null;
  endsAt: string | null;
}

const BANGKOK_OFFSET_MS = 7 * 3_600_000;

function quarterOf(date: Date): { year: number; q: number } {
  const local = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  return { year: local.getUTCFullYear(), q: Math.floor(local.getUTCMonth() / 3) + 1 };
}

const keyOf = ({ year, q }: { year: number; q: number }): SeasonKey => `${year}-Q${q}` as SeasonKey;
const index = ({ year, q }: { year: number; q: number }) => year * 4 + (q - 1);
const fromIndex = (i: number) => ({ year: Math.floor(i / 4), q: (i % 4) + 1 });

/** Midnight Bangkok time at the start of a quarter, as an ISO string. */
function quarterStart({ year, q }: { year: number; q: number }): string {
  return new Date(Date.UTC(year, (q - 1) * 3, 1) - BANGKOK_OFFSET_MS).toISOString();
}

/** When a match happened: its match date if known, else when it was recorded. */
function matchTime(m: Match): Date {
  return new Date(m.played_at ?? m.created_at);
}

/** The Bangkok calendar day of an instant, "YYYY-MM-DD". */
function bangkokDay(iso: string): string {
  return new Date(new Date(iso).getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

export function seasonOf(m: Match, epoch: string | null): SeasonKey {
  if (epoch) {
    // Recorded before the cut-over → pre-season.
    if (new Date(m.created_at).getTime() < new Date(epoch).getTime()) return "pre";
    // Match dates are whole days (stored at 12:00 UTC), so compare days: a match
    // dated on the cut-over day itself belongs to the new season.
    if (m.played_at && m.played_at.slice(0, 10) < bangkokDay(epoch)) return "pre";
  }
  return keyOf(quarterOf(matchTime(m)));
}

/** Every season from the first one to the current quarter (newest first), pre-season last. */
export function listSeasons(matches: readonly Match[], epoch: string | null, now: Date = new Date()): Season[] {
  const current = quarterOf(now);
  const keys = matches.map((m) => seasonOf(m, epoch));
  const hasPre = keys.includes("pre");

  let first = index(epoch ? quarterOf(new Date(epoch)) : current);
  let last = index(current);
  for (const m of matches) {
    if (seasonOf(m, epoch) === "pre") continue;
    const i = index(quarterOf(matchTime(m)));
    if (!epoch) first = Math.min(first, i);
    // A match dated in a later quarter (e.g. a typo) must still be reachable.
    last = Math.max(last, i);
  }
  last = Math.max(last, first);

  const out: Season[] = [];
  for (let i = last; i >= first; i -= 1) {
    const qtr = fromIndex(i);
    const isFirst = i === first;
    out.push({
      key: keyOf(qtr),
      number: i - first + 1,
      current: i === index(current),
      startsAt: isFirst && epoch ? new Date(epoch).toISOString() : quarterStart(qtr),
      endsAt: quarterStart(fromIndex(i + 1)),
    });
  }
  if (hasPre) out.push({ key: "pre", number: 0, current: false, startsAt: null, endsAt: epoch });
  return out;
}

/** `?season=` → a valid scope; anything unknown falls back to the current season. */
export function parseScope(param: string | undefined, seasons: readonly Season[]): Scope {
  if (param === "all") return "all";
  if (param && seasons.some((s) => s.key === param)) return param as SeasonKey;
  return (seasons.find((s) => s.current) ?? seasons[0])?.key ?? "all";
}

export function matchesInScope<T extends Match>(matches: readonly T[], scope: Scope, epoch: string | null): T[] {
  return scope === "all" ? [...matches] : matches.filter((m) => seasonOf(m, epoch) === scope);
}
