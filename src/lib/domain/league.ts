import { officialMatches, sortChronologically, winnerPlayerId } from "./match";
import type { Match, Outcome, Player, PlayerPair } from "./types";

/** A group member with a stable seat number (1-based) used for colours and PINs. */
export interface RosterPlayer extends Player {
  seat: number;
}

export type Roster = readonly RosterPlayer[];

export const POINTS = { win: 3, draw: 1, loss: 0 } as const;

export function playersOf(match: Match): [string, string] {
  return [match.sides[0].player_id, match.sides[1].player_id];
}

export function involves(match: Match, playerId: string): boolean {
  return match.sides.some((s) => s.player_id === playerId);
}

export function isBetween(match: Match, x: string, y: string): boolean {
  return involves(match, x) && involves(match, y) && x !== y;
}

/** Matches between exactly these two players (any status), chronological. */
export function matchesBetween(matches: readonly Match[], x: string, y: string): Match[] {
  return sortChronologically(matches.filter((m) => isBetween(m, x, y)));
}

/** Winner's player id (penalties decide a level score), null for a draw. */
const winnerOf = winnerPlayerId;

export function outcomeOf(match: Match, playerId: string): Outcome {
  const w = winnerOf(match);
  if (w === null) return "D";
  return w === playerId ? "W" : "L";
}

/** Orders two roster players into a PlayerPair (a = lower seat), for the head-to-head views. */
export function pairFor(roster: Roster, x: string, y: string): PlayerPair & { seats: [number, number] } {
  const px = roster.find((p) => p.id === x);
  const py = roster.find((p) => p.id === y);
  if (!px || !py) throw new Error("Player is not in the roster");
  const [a, b] = px.seat < py.seat ? [px, py] : [py, px];
  const strip = ({ id, display_name, avatar_url }: RosterPlayer): Player => ({ id, display_name, avatar_url });
  return { a: strip(a), b: strip(b), seats: [a.seat, b.seat] };
}

/** Every unordered pair of players, seat order (1-2, 1-3, 2-3). */
export function allPairs(roster: Roster): Array<[RosterPlayer, RosterPlayer]> {
  const sorted = [...roster].sort((p, q) => p.seat - q.seat);
  const out: Array<[RosterPlayer, RosterPlayer]> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) out.push([sorted[i], sorted[j]]);
  }
  return out;
}

export interface StandingRow {
  player: RosterPlayer;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  winRate: number | null;
  /** Last 5 results, oldest → newest. */
  form: Outcome[];
}

/**
 * League table from confirmed matches: 3 points for a win, 1 for a draw.
 * Tie-breaks: points, goal difference, goals scored, wins, then seat.
 */
export function computeStandings(matches: readonly Match[], roster: Roster): StandingRow[] {
  const official = officialMatches(matches);
  const rows = roster.map((player) => {
    const mine = official.filter((m) => involves(m, player.id));
    let wins = 0;
    let draws = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    for (const m of mine) {
      const me = m.sides.find((s) => s.player_id === player.id)!;
      const opp = m.sides.find((s) => s.player_id !== player.id)!;
      goalsFor += me.goals;
      goalsAgainst += opp.goals;
      const o = outcomeOf(m, player.id);
      if (o === "W") wins += 1;
      else if (o === "D") draws += 1;
    }
    const played = mine.length;
    return {
      player,
      played,
      wins,
      draws,
      losses: played - wins - draws,
      goalsFor,
      goalsAgainst,
      goalDiff: goalsFor - goalsAgainst,
      points: wins * POINTS.win + draws * POINTS.draw,
      winRate: played > 0 ? (wins / played) * 100 : null,
      form: mine.slice(-5).map((m) => outcomeOf(m, player.id)),
    };
  });
  return rows.sort(
    (x, y) =>
      y.points - x.points ||
      y.goalDiff - x.goalDiff ||
      y.goalsFor - x.goalsFor ||
      y.wins - x.wins ||
      x.player.seat - y.player.seat,
  );
}

export interface PairRecord {
  a: RosterPlayer;
  b: RosterPlayer;
  played: number;
  winsA: number;
  winsB: number;
  draws: number;
}

/** Win/draw/loss record for every pair, from confirmed matches. */
export function pairRecords(matches: readonly Match[], roster: Roster): PairRecord[] {
  const official = officialMatches(matches);
  return allPairs(roster).map(([a, b]) => {
    const between = official.filter((m) => isBetween(m, a.id, b.id));
    const winsA = between.filter((m) => winnerOf(m) === a.id).length;
    const winsB = between.filter((m) => winnerOf(m) === b.id).length;
    return { a, b, played: between.length, winsA, winsB, draws: between.length - winsA - winsB };
  });
}

export type PointsPoint = { matchNo: number; label: string } & Record<`p${number}`, number>;

/** Cumulative league points per seat after each confirmed match (keys p1, p2, p3…). */
export function pointsTimeline(matches: readonly Match[], roster: Roster): PointsPoint[] {
  const totals = new Map(roster.map((p) => [p.id, 0]));
  return officialMatches(matches).map((m) => {
    for (const id of playersOf(m)) {
      if (!totals.has(id)) continue;
      const o = outcomeOf(m, id);
      totals.set(id, totals.get(id)! + (o === "W" ? POINTS.win : o === "D" ? POINTS.draw : POINTS.loss));
    }
    const point = { matchNo: m.match_no, label: `#${m.match_no}` } as PointsPoint;
    for (const p of roster) point[`p${p.seat}`] = totals.get(p.id)!;
    return point;
  });
}

/**
 * Resolves `?pair=1-3` to two roster players. Falls back to the signed-in
 * player's most-played opponent, then to seats 1 and 2.
 */
export function resolvePair(
  param: string | undefined,
  roster: Roster,
  matches: readonly Match[],
  meId: string | null,
): [RosterPlayer, RosterPlayer] | null {
  const bySeat = (n: number) => roster.find((p) => p.seat === n);
  const m = param?.match(/^(\d+)-(\d+)$/);
  if (m) {
    const x = bySeat(Number(m[1]));
    const y = bySeat(Number(m[2]));
    if (x && y && x.id !== y.id) return x.seat < y.seat ? [x, y] : [y, x];
  }
  const me = roster.find((p) => p.id === meId);
  if (me) {
    const opponents = roster
      .filter((p) => p.id !== me.id)
      .map((p) => ({ p, n: matches.filter((x) => isBetween(x, me.id, p.id)).length }))
      .sort((x, y) => y.n - x.n || x.p.seat - y.p.seat);
    if (opponents[0]) {
      const o = opponents[0].p;
      return me.seat < o.seat ? [me, o] : [o, me];
    }
  }
  const sorted = [...roster].sort((x, y) => x.seat - y.seat);
  return sorted.length >= 2 ? [sorted[0], sorted[1]] : null;
}
