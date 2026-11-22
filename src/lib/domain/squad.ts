import { STAT_KEYS } from "./types";

/**
 * PvP 3v3 ("squad") matches: three of us on one team against another team.
 * The post-match screen is a scrolling table — one column per teammate, one
 * row per statistic — so a match is captured over 5–6 screenshots that are
 * merged column by column. Everything here is pure (shared by server and UI).
 */

export const SQUAD_SLOTS = [1, 2, 3] as const;
export type SquadSlot = (typeof SQUAD_SLOTS)[number];

export type SquadGroup = "rating" | "attack" | "buildup" | "movement" | "defence";

/** Every number on the squad screen, keyed by a stable id. */
export const SQUAD_STAT_KEYS = [
  "total_points",
  "offensive_positioning",
  "shooting",
  "dueling",
  "defensive_positioning",
  "passing",
  "dribbling",
  "goals",
  "shots",
  "shots_on_target",
  "assists",
  "key_passes",
  "passes",
  "successful_passes",
  "instrumental_passes",
  "dribbles",
  "successful_dribbles",
  "instrumental_dribbles",
  "receiving",
  "good_receives",
  "overlaps",
  "runs_out_wide",
  "forward_runs",
  "offensive_receives",
  "intercepts",
  "tackles",
  "impactful_steals",
  "frontal_presses",
  "presses_from_behind",
  "good_positioning_pct",
  "double_marks",
  "passes_obstructed",
  "players_marked",
] as const;

export type SquadStatKey = (typeof SQUAD_STAT_KEYS)[number];
export type SquadStats = Partial<Record<SquadStatKey, number | null>>;

export type RowFormat = "int" | "pair" | "pct";

/**
 * One table row as printed in the game. "pair" rows show "29 (16)": the
 * second key is the bracketed number. `label` is the English text on screen,
 * used to recognise the row in a screenshot.
 */
export interface SquadRow {
  label: string;
  keys: readonly [SquadStatKey] | readonly [SquadStatKey, SquadStatKey];
  format: RowFormat;
  group: SquadGroup;
  max: number;
}

export const SQUAD_ROWS: readonly SquadRow[] = [
  { label: "Total Points", keys: ["total_points"], format: "int", group: "rating", max: 99_999 },
  { label: "Offensive Positioning", keys: ["offensive_positioning"], format: "int", group: "rating", max: 99_999 },
  { label: "Shooting", keys: ["shooting"], format: "int", group: "rating", max: 99_999 },
  { label: "Dueling", keys: ["dueling"], format: "int", group: "rating", max: 99_999 },
  { label: "Defensive Positioning", keys: ["defensive_positioning"], format: "int", group: "rating", max: 99_999 },
  { label: "Passing", keys: ["passing"], format: "int", group: "rating", max: 99_999 },
  { label: "Dribbling", keys: ["dribbling"], format: "int", group: "rating", max: 99_999 },
  { label: "Goals", keys: ["goals"], format: "int", group: "attack", max: 50 },
  { label: "Shots (On target)", keys: ["shots", "shots_on_target"], format: "pair", group: "attack", max: 200 },
  { label: "Assist", keys: ["assists"], format: "int", group: "attack", max: 50 },
  { label: "Key Passes", keys: ["key_passes"], format: "int", group: "attack", max: 200 },
  { label: "Passes (Successful)", keys: ["passes", "successful_passes"], format: "pair", group: "buildup", max: 2000 },
  { label: "Instrumental Passes", keys: ["instrumental_passes"], format: "int", group: "buildup", max: 2000 },
  { label: "Dribbles (Successful)", keys: ["dribbles", "successful_dribbles"], format: "pair", group: "buildup", max: 2000 },
  { label: "Instrumental Dribbles", keys: ["instrumental_dribbles"], format: "int", group: "buildup", max: 2000 },
  { label: "Receiving", keys: ["receiving"], format: "int", group: "buildup", max: 2000 },
  { label: "Good Receives", keys: ["good_receives"], format: "int", group: "buildup", max: 2000 },
  { label: "Overlaps", keys: ["overlaps"], format: "int", group: "movement", max: 2000 },
  { label: "Runs Out Wide", keys: ["runs_out_wide"], format: "int", group: "movement", max: 2000 },
  { label: "Forward Runs", keys: ["forward_runs"], format: "int", group: "movement", max: 2000 },
  { label: "Offensive Receives", keys: ["offensive_receives"], format: "int", group: "movement", max: 2000 },
  { label: "Intercepts", keys: ["intercepts"], format: "int", group: "defence", max: 2000 },
  { label: "Tackles", keys: ["tackles"], format: "int", group: "defence", max: 2000 },
  { label: "Impactful Steals", keys: ["impactful_steals"], format: "int", group: "defence", max: 2000 },
  { label: "Frontal Presses", keys: ["frontal_presses"], format: "int", group: "defence", max: 2000 },
  { label: "Presses from Behind", keys: ["presses_from_behind"], format: "int", group: "defence", max: 2000 },
  { label: "Good Positioning", keys: ["good_positioning_pct"], format: "pct", group: "defence", max: 100 },
  { label: "Double-Marks", keys: ["double_marks"], format: "int", group: "defence", max: 2000 },
  { label: "Passes Obstructed", keys: ["passes_obstructed"], format: "int", group: "defence", max: 2000 },
  { label: "Players Marked", keys: ["players_marked"], format: "int", group: "defence", max: 2000 },
];

/** The six axes of the in-game "Evaluation Graph", in the game's clockwise order. */
export const RADAR_KEYS = [
  "offensive_positioning",
  "shooting",
  "dueling",
  "defensive_positioning",
  "passing",
  "dribbling",
] as const satisfies readonly SquadStatKey[];

export const SQUAD_GROUPS: readonly SquadGroup[] = ["rating", "attack", "buildup", "movement", "defence"];

const ROW_BY_KEY = new Map<SquadStatKey, SquadRow>(SQUAD_ROWS.flatMap((r) => r.keys.map((k) => [k, r] as const)));

export function rowFor(key: SquadStatKey): SquadRow {
  return ROW_BY_KEY.get(key)!;
}

/**
 * Evaluation points can go below zero (a dribble that loses the ball costs
 * points: "Dribbling -23"); every other number on the screen is a count.
 */
export function isSigned(key: SquadStatKey): boolean {
  return rowFor(key).group === "rating";
}

export function minOf(key: SquadStatKey): number {
  return isSigned(key) ? -rowFor(key).max : 0;
}

export function isSquadStatKey(value: string): value is SquadStatKey {
  return ROW_BY_KEY.has(value as SquadStatKey);
}

export function groupKeys(group: SquadGroup): SquadStatKey[] {
  return SQUAD_ROWS.filter((r) => r.group === group).flatMap((r) => [...r.keys]);
}

// ---------------------------------------------------------------------------
// Recognising row labels and names in OCR text
// ---------------------------------------------------------------------------

/** Lower-case letters and digits only; OCR confuses O/0 and l/1/I, so those are folded together. */
export function foldText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/o/g, "0")
    .replace(/[il|]/g, "1");
}

export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const FOLDED_ROWS = SQUAD_ROWS.map((row) => ({ row, folded: foldText(row.label) }));

/** The table row an OCR'd label belongs to (tolerates a few misread letters), or null. */
export function matchRowLabel(text: string): SquadRow | null {
  const t = foldText(text);
  if (t.length < 4) return null;
  let best: { row: SquadRow; dist: number } | null = null;
  for (const { row, folded } of FOLDED_ROWS) {
    const dist = editDistance(t, folded);
    if (dist <= Math.max(1, Math.floor(folded.length / 6)) && (!best || dist < best.dist)) best = { row, dist };
  }
  return best?.row ?? null;
}

export interface NameAlias {
  name: string;
  playerId: string;
}

/** The player an OCR'd in-game name belongs to (exact or a couple of misread letters), or null. */
export function matchAlias(text: string | null, aliases: readonly NameAlias[]): NameAlias | null {
  if (!text) return null;
  const t = foldText(text);
  if (t.length < 2) return null;
  let best: { alias: NameAlias; dist: number } | null = null;
  for (const alias of aliases) {
    const n = foldText(alias.name);
    if (!n) continue;
    const dist = t === n ? 0 : editDistance(t, n);
    const allowed = n.length >= 8 ? 2 : n.length >= 4 ? 1 : 0;
    if (dist <= allowed && (!best || dist < best.dist)) best = { alias, dist };
  }
  return best?.alias ?? null;
}

/**
 * In-game names the group told us about, matched to roster players by
 * display name (case-insensitive). Learned aliases from the database are
 * checked first; these only fill in when nothing was learned yet.
 */
export const DEFAULT_ALIASES: ReadonlyArray<{ name: string; displayNames: readonly string[] }> = [
  { name: "WyNM", displayNames: ["m", "wynm"] },
  { name: "Do3minicT0rett0", displayNames: ["dom", "dominic"] },
  { name: "bigverx", displayNames: ["big", "bigverx"] },
];

export function defaultAliases(roster: ReadonlyArray<{ id: string; display_name: string }>): NameAlias[] {
  const out: NameAlias[] = [];
  for (const d of DEFAULT_ALIASES) {
    const p = roster.find((r) => d.displayNames.includes(r.display_name.trim().toLowerCase()));
    if (p) out.push({ name: d.name, playerId: p.id });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parsing and merging screenshot reads
// ---------------------------------------------------------------------------

/** "29 (16)" → [29, 16]; "61%" → [61]; "17" → [17]; "-23" → [-23] when signed. Null when the text doesn't fit the row's format. */
export function parseCell(text: string, format: RowFormat, signed = false): number[] | null {
  const t = text.replace(/\s+/g, " ").trim();
  if (format === "pair") {
    const m = t.match(/^(\d{1,4}) ?\((\d{1,4})\)$/);
    return m ? [Number(m[1]), Number(m[2])] : null;
  }
  if (format === "pct") {
    const m = t.replace(/ /g, "").match(/^(\d{1,3})%?$/);
    return m ? [Number(m[1])] : null;
  }
  const m = t.replace(/ /g, "").match(signed ? /^(-?\d{1,5})$/ : /^(\d{1,5})$/);
  return m ? [Number(m[1])] : null;
}

export const AWARD_TIERS = ["gold", "silver", "bronze"] as const;
export type AwardTier = (typeof AWARD_TIERS)[number];

/** A title from the "Co-op Awards" screen ("The Architect", "Goal Hunter" …) and its pill colour. */
export interface SquadAward {
  title: string;
  tier: AwardTier;
}

/** One screenshot's worth of reads: names per column and the rows it showed. */
export interface SquadScreenRead {
  names: Array<string | null>;
  team: string | null;
  /** Values per column (index 0–2); null = row seen but the cell couldn't be read. */
  values: Partial<Record<SquadStatKey, Array<number | null>>>;
  /**
   * Set on the Co-op Awards screen: titles per column of THAT screen, whose
   * column order may differ from the stats table (`names` are its names).
   */
  awards?: SquadAward[][] | null;
}

export interface SquadDraftColumn {
  slot: SquadSlot;
  ingameName: string | null;
  playerId: string | null;
  stats: SquadStats;
  awards: SquadAward[];
}

export interface SquadDraft {
  team: string | null;
  columns: SquadDraftColumn[];
  /** Keys whose value differed between two screenshots (the first read is kept). */
  conflicts: Array<{ slot: SquadSlot; key: SquadStatKey }>;
  /** Rows no screenshot covered. */
  missingRows: string[];
}

/**
 * Merges several screenshots of one match. The first readable value for a
 * cell wins; a disagreeing later read is reported, never silently mixed in.
 * Names: the most frequent read per column.
 */
export function mergeScreenReads(allReads: readonly SquadScreenRead[], aliases: readonly NameAlias[]): SquadDraft {
  const conflicts: SquadDraft["conflicts"] = [];
  const reads = allReads.filter((r) => !r.awards);
  const columns: SquadDraftColumn[] = SQUAD_SLOTS.map((slot, i) => {
    const names = reads.map((r) => r.names[i]).filter((n): n is string => Boolean(n && n.trim()));
    const ingameName = mostCommon(names);
    const stats: SquadStats = {};
    for (const read of reads) {
      for (const [key, values] of Object.entries(read.values) as Array<[SquadStatKey, Array<number | null>]>) {
        const v = values[i] ?? null;
        if (v === null) {
          if (!(key in stats)) stats[key] = null;
          continue;
        }
        const prev = stats[key];
        if (prev === undefined || prev === null) stats[key] = v;
        else if (prev !== v) conflicts.push({ slot, key });
      }
    }
    // Total Points is the sum of the six category points; its stylised digits are the hardest to read.
    const sum = categorySum(stats);
    if (sum !== null) stats.total_points = sum;
    return { slot, ingameName, playerId: matchAlias(ingameName, aliases)?.playerId ?? null, stats, awards: [] };
  });
  attachAwards(columns, allReads.filter((r) => r.awards));
  // Never pre-select the same player for two columns.
  const seen = new Set<string>();
  for (const c of columns) {
    if (c.playerId && seen.has(c.playerId)) c.playerId = null;
    if (c.playerId) seen.add(c.playerId);
  }
  const covered = new Set(reads.flatMap((r) => Object.keys(r.values)));
  const missingRows = SQUAD_ROWS.filter((row) => !row.keys.some((k) => covered.has(k))).map((r) => r.label);
  return { team: mostCommon(reads.map((r) => r.team).filter((t): t is string => Boolean(t))), columns, conflicts, missingRows };
}

/** Sum of the six Evaluation Graph categories (= Total Points), or null when one is missing. */
export function categorySum(stats: SquadStats): number | null {
  let sum = 0;
  for (const k of RADAR_KEYS) {
    const v = stats[k];
    if (v === null || v === undefined) return null;
    sum += v;
  }
  return sum;
}

/**
 * The awards screen lists the players in its own order: titles are matched to
 * table columns by in-game name (O/0-tolerant), by position when names are unknown.
 */
function attachAwards(columns: SquadDraftColumn[], awardReads: readonly SquadScreenRead[]): void {
  const byName = columns.filter((c) => c.ingameName).map((c) => ({ name: c.ingameName!, playerId: String(c.slot) }));
  for (const read of awardReads) {
    const lists = read.awards!;
    const taken = new Set<SquadDraftColumn>();
    const leftover: number[] = [];
    lists.forEach((titles, j) => {
      if (!titles || titles.length === 0) return;
      const named = byName.length > 0 ? matchAlias(read.names[j] ?? null, byName) : null;
      const column = named ? columns.find((c) => String(c.slot) === named.playerId) : byName.length === 0 ? columns[j] : undefined;
      if (column && !taken.has(column)) {
        taken.add(column);
        if (column.awards.length === 0) column.awards = titles.slice(0, 6);
      } else leftover.push(j);
    });
    // Unreadable names: the remaining award columns go to the remaining table columns, in order.
    const free = columns.filter((c) => !taken.has(c));
    leftover.forEach((j, k) => {
      const column = free[k];
      if (column && column.awards.length === 0) column.awards = lists[j].slice(0, 6);
    });
  }
}

function mostCommon(values: readonly string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v.trim(), (counts.get(v.trim()) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface SquadIssue {
  slot: SquadSlot | null;
  key: SquadStatKey | null;
  message: string;
}

/** Pairs where the bracketed number can't exceed the first one. */
const PART_OF: ReadonlyArray<[SquadStatKey, SquadStatKey]> = [
  ["shots_on_target", "shots"],
  ["successful_passes", "passes"],
  ["successful_dribbles", "dribbles"],
  ["goals", "shots"],
];

export function validateSquadColumns(columns: ReadonlyArray<Pick<SquadDraftColumn, "slot" | "playerId" | "stats">>): SquadIssue[] {
  const issues: SquadIssue[] = [];
  const players = columns.map((c) => c.playerId).filter((p): p is string => Boolean(p));
  if (players.length < 2) issues.push({ slot: null, key: null, message: "At least two columns must be one of us." });
  if (new Set(players).size !== players.length) issues.push({ slot: null, key: null, message: "A player can only be in one column." });
  for (const c of columns) {
    for (const [key, v] of Object.entries(c.stats) as Array<[SquadStatKey, number | null]>) {
      if (v === null || v === undefined) continue;
      if (!Number.isInteger(v) || v < minOf(key) || v > rowFor(key).max) issues.push({ slot: c.slot, key, message: "Value out of range." });
    }
    for (const [part, whole] of PART_OF) {
      const p = c.stats[part];
      const w = c.stats[whole];
      if (p != null && w != null && p > w) issues.push({ slot: c.slot, key: part, message: "Can't be more than its total." });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Aggregates for the stats pages
// ---------------------------------------------------------------------------

export interface SquadPlayerLine {
  slot: SquadSlot;
  player_id: string | null;
  ingame_name: string | null;
  stats: SquadStats;
  /** Co-op Awards titles (absent on matches saved before awards were read). */
  awards?: SquadAward[];
}

/** Team stats from the "Full Time" score screen (1v1 stat keys, plus penalties after a shoot-out). */
export const TEAM_STAT_KEYS = [...STAT_KEYS, "penalties"] as const;
export type TeamStatKey = (typeof TEAM_STAT_KEYS)[number];
export type TeamSide = Partial<Record<TeamStatKey, number | null>>;
export interface TeamStats {
  us: TeamSide;
  them: TeamSide;
}

export interface SquadMatch {
  id: string;
  played_at: string | null;
  team_name: string | null;
  opponent_name: string | null;
  goals_for: number | null;
  goals_against: number | null;
  team_stats: TeamStats | null;
  created_at: string;
  players: SquadPlayerLine[];
}

export type SquadOutcome = "W" | "D" | "L";

/** A level score decided on penalties counts as a win/loss for the shoot-out result. */
export function squadOutcome(m: Pick<SquadMatch, "goals_for" | "goals_against"> & { team_stats?: TeamStats | null }): SquadOutcome | null {
  if (m.goals_for === null || m.goals_against === null) return null;
  if (m.goals_for !== m.goals_against) return m.goals_for > m.goals_against ? "W" : "L";
  const pf = m.team_stats?.us.penalties;
  const pa = m.team_stats?.them.penalties;
  if (pf != null && pa != null && pf !== pa) return pf > pa ? "W" : "L";
  return "D";
}

/** Goal difference from our side (null without a score). */
export function goalMargin(m: Pick<SquadMatch, "goals_for" | "goals_against">): number | null {
  return m.goals_for === null || m.goals_against === null ? null : m.goals_for - m.goals_against;
}

export interface FullTimeSide {
  goals: number | null;
  label: string | null;
}

/**
 * Which side of a Full Time screen is our team: the label that matches our
 * team name, else the side whose goals equal our players' goals added up.
 * Null when it can't be told (the user picks).
 */
export function ourFullTimeSide(left: FullTimeSide, right: FullTimeSide, teamName: string | null, ourGoals: number | null): "left" | "right" | null {
  const team = teamName ? foldText(teamName) : "";
  if (team.length >= 2) {
    const l = left.label ? foldText(left.label) : "";
    const r = right.label ? foldText(right.label) : "";
    // OCR slips ("8VB") are tolerated; it only decides when exactly one side matches.
    const near = (x: string) => x.length >= 2 && (x.includes(team) || team.includes(x) || editDistance(x, team) <= (team.length >= 3 ? 1 : 0));
    const lm = near(l);
    const rm = near(r);
    if (lm !== rm) return lm ? "left" : "right";
  }
  if (ourGoals !== null && left.goals !== null && right.goals !== null && left.goals !== right.goals) {
    if (left.goals === ourGoals) return "left";
    if (right.goals === ourGoals) return "right";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Wins vs losses: how the team and each player play when we win or lose
// ---------------------------------------------------------------------------

export interface OutcomeSplit<T> {
  W: T;
  D: T;
  L: T;
}

function average(values: ReadonlyArray<number | null | undefined>): number | null {
  const v = values.filter((x): x is number => x !== null && x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Average team stats (ours and theirs) over the matches with each outcome. */
export function teamStatsByOutcome(
  matches: readonly SquadMatch[],
  keys: readonly TeamStatKey[],
): OutcomeSplit<{ games: number; us: TeamSide; them: TeamSide }> {
  const pick = (o: SquadOutcome) => {
    const ms = matches.filter((m) => squadOutcome(m) === o);
    const side = (who: "us" | "them") => Object.fromEntries(keys.map((k) => [k, average(ms.map((m) => m.team_stats?.[who][k]))])) as TeamSide;
    return { games: ms.length, us: side("us"), them: side("them") };
  };
  return { W: pick("W"), D: pick("D"), L: pick("L") };
}

/** A player's per-match averages split by result. */
export function playerByOutcome(matches: readonly SquadMatch[], playerId: string): OutcomeSplit<SquadPlayerSummary> {
  const by = (o: SquadOutcome) => summarizeSquadPlayer(matches.filter((m) => squadOutcome(m) === o), playerId);
  return { W: by("W"), D: by("D"), L: by("L") };
}

/** Team goals = the goals of every column (ours and a stranger's), when all were read. */
export function teamGoals(players: readonly SquadPlayerLine[]): number | null {
  let sum = 0;
  for (const p of players) {
    const g = p.stats.goals;
    if (g === null || g === undefined) return null;
    sum += g;
  }
  return players.length > 0 ? sum : null;
}

export interface SquadAverage {
  total: number;
  average: number | null;
  samples: number;
}

export interface SquadPlayerSummary {
  playerId: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  /** Matches where this player had the most total points of the team. */
  mvps: number;
  stats: Record<SquadStatKey, SquadAverage>;
  shotAccuracy: number | null;
  passCompletion: number | null;
  dribbleSuccess: number | null;
  goalContributions: number;
}

/** Most total points among the columns of a match; ties give no MVP. */
export function mvpOf(m: SquadMatch): string | null {
  const scored = m.players.filter((p) => p.player_id && p.stats.total_points != null);
  if (scored.length === 0) return null;
  const best = Math.max(...scored.map((p) => p.stats.total_points!));
  const top = m.players.filter((p) => p.stats.total_points === best);
  return top.length === 1 ? top[0].player_id : null;
}

function ratio(rows: ReadonlyArray<{ part: number | null | undefined; whole: number | null | undefined }>): number | null {
  let part = 0;
  let whole = 0;
  for (const r of rows) {
    if (r.part == null || r.whole == null) continue;
    part += r.part;
    whole += r.whole;
  }
  return whole > 0 ? (part / whole) * 100 : null;
}

export function summarizeSquadPlayer(matches: readonly SquadMatch[], playerId: string): SquadPlayerSummary {
  const lines: Array<{ m: SquadMatch; s: SquadStats }> = [];
  for (const m of matches) {
    const p = m.players.find((x) => x.player_id === playerId);
    if (p) lines.push({ m, s: p.stats });
  }
  const stats = Object.fromEntries(
    SQUAD_STAT_KEYS.map((k) => {
      let total = 0;
      let samples = 0;
      for (const { s } of lines) {
        const v = s[k];
        if (v == null) continue;
        total += v;
        samples += 1;
      }
      return [k, { total, average: samples > 0 ? total / samples : null, samples }];
    }),
  ) as Record<SquadStatKey, SquadAverage>;
  const outcomes = lines.map(({ m }) => squadOutcome(m));
  return {
    playerId,
    games: lines.length,
    wins: outcomes.filter((o) => o === "W").length,
    draws: outcomes.filter((o) => o === "D").length,
    losses: outcomes.filter((o) => o === "L").length,
    mvps: lines.filter(({ m }) => mvpOf(m) === playerId).length,
    stats,
    shotAccuracy: ratio(lines.map(({ s }) => ({ part: s.shots_on_target, whole: s.shots }))),
    passCompletion: ratio(lines.map(({ s }) => ({ part: s.successful_passes, whole: s.passes }))),
    dribbleSuccess: ratio(lines.map(({ s }) => ({ part: s.successful_dribbles, whole: s.dribbles }))),
    goalContributions: stats.goals.total + stats.assists.total,
  };
}

/** One point per match for a stat, per player (null when they didn't play or it wasn't read). Oldest first. */
export function squadTimeline(
  matches: readonly SquadMatch[],
  playerIds: readonly string[],
  key: SquadStatKey,
): Array<{ index: number; label: string; values: Record<string, number | null> }> {
  return [...matches]
    .sort((a, b) => matchTime(a) - matchTime(b))
    .map((m, i) => ({
      index: i + 1,
      label: `#${i + 1}`,
      values: Object.fromEntries(playerIds.map((id) => [id, m.players.find((p) => p.player_id === id)?.stats[key] ?? null])),
    }));
}

export function matchTime(m: Pick<SquadMatch, "played_at" | "created_at">): number {
  return Date.parse(m.played_at ?? m.created_at);
}
