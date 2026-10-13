import "server-only";

import { cache } from "react";
import { ApiError } from "@/lib/api/envelope";
import { toApiError } from "@/lib/api/server";
import { getSessionUser } from "@/lib/auth/session";
import { withUser, type Tx } from "@/lib/db";
import type { Match, MatchSide, Player, PlayerKey, PlayerPair } from "@/lib/domain/types";

export interface Rivalry {
  id: string;
  name: string;
  created_at: string;
}

export interface RivalryContext {
  userId: string;
  email: string;
  profile: Player;
  rivalry: Rivalry | null;
  members: Player[];
  /** Both players, once the friend has joined. Player A = room creator. */
  pair: PlayerPair | null;
  /** Which player the signed-in user is. */
  me: PlayerKey | null;
}

interface MemberRow extends Player {
  role: "owner" | "member";
  joined_at: string;
}

/** Loads the signed-in user, their profile and rivalry room (once per request). */
export const getRivalryContext = cache(async (): Promise<RivalryContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  return withUser(user.id, async (tx) => {
    const [profile] = await tx<Player[]>`select id, display_name, avatar_url from public.profiles where id = ${user.id}`;
    const [rivalry] = await tx<Rivalry[]>`
      select r.id, r.name, r.created_at::text as created_at
      from public.rivalry_members m join public.rivalries r on r.id = m.rivalry_id
      where m.user_id = ${user.id}`;

    const base: RivalryContext = {
      userId: user.id,
      email: user.email,
      profile: profile ?? { id: user.id, display_name: user.email.split("@")[0], avatar_url: null },
      rivalry: rivalry ?? null,
      members: [],
      pair: null,
      me: null,
    };
    if (!rivalry) return base;

    const rows = await tx<MemberRow[]>`
      select p.id, p.display_name, p.avatar_url, m.role, m.joined_at::text as joined_at
      from public.rivalry_members m join public.profiles p on p.id = m.user_id
      where m.rivalry_id = ${rivalry.id}
      order by (m.role = 'owner') desc, m.joined_at`;
    const members = rows.map(({ id, display_name, avatar_url }) => ({ id, display_name, avatar_url }));
    const pair = members.length === 2 ? { a: members[0], b: members[1] } : null;
    const me: PlayerKey | null = pair ? (pair.a.id === user.id ? "a" : "b") : null;
    return { ...base, members, pair, me };
  });
});

/** For route handlers: requires a signed-in user who belongs to a rivalry. */
export async function requireRivalry(opts: { needPair?: boolean } = {}) {
  const ctx = await getRivalryContext();
  if (!ctx) throw new ApiError("UNAUTHENTICATED", "Please sign in.", 401);
  if (!ctx.rivalry) throw new ApiError("NOT_IN_RIVALRY", "Create or join a rivalry room first.", 409);
  if (opts.needPair && !ctx.pair) {
    throw new ApiError("RIVALRY_INCOMPLETE", "Your friend needs to join the room first.", 409);
  }
  return ctx as RivalryContext & { rivalry: Rivalry };
}

export async function requireUser() {
  const ctx = await getRivalryContext();
  if (!ctx) throw new ApiError("UNAUTHENTICATED", "Please sign in.", 401);
  return ctx;
}

/** Runs user-scoped SQL (RLS enforced) and maps database errors to ApiErrors. */
export async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>, fallback?: string): Promise<T> {
  try {
    return await withUser(userId, fn);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(err as { message?: string; code?: string }, fallback);
  }
}

interface MatchRow {
  match: Omit<Match, "sides"> & { sides: MatchSide[] };
}

const MATCH_JSON = (tx: Tx) => tx`
  jsonb_build_object(
    'id', m.id, 'match_no', m.match_no, 'played_at', m.played_at, 'status', m.status,
    'status_note', m.status_note, 'created_by', m.created_by,
    'created_at', m.created_at, 'updated_at', m.updated_at,
    'sides', coalesce((
      select jsonb_agg(to_jsonb(s) - 'match_id' order by s.screen_side)
      from public.match_sides s where s.match_id = m.id
    ), '[]'::jsonb)
  )`;

function toMatch({ match }: MatchRow): Match | null {
  if (match.sides.length !== 2) return null;
  const sides = match.sides.map((s) => ({
    ...s,
    possession_pct: s.possession_pct === null ? null : Number(s.possession_pct),
  }));
  return { ...match, sides: [sides[0], sides[1]] };
}

/** All matches of a rivalry (every status), in match_no order. Timestamps come back as ISO strings. */
export async function loadMatches(tx: Tx, rivalryId: string): Promise<Match[]> {
  const rows = await tx<MatchRow[]>`
    select ${MATCH_JSON(tx)} as match from public.matches m
    where m.rivalry_id = ${rivalryId} order by m.match_no`;
  return rows.map(toMatch).filter((m): m is Match => m !== null);
}

export async function loadMatch(tx: Tx, matchId: string): Promise<Match | null> {
  const [row] = await tx<MatchRow[]>`select ${MATCH_JSON(tx)} as match from public.matches m where m.id = ${matchId}`;
  return row ? toMatch(row) : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

/** Route param guard: malformed IDs are a 404, not a database error. */
export function requireUuid(id: string): string {
  if (!isUuid(id)) throw new ApiError("NOT_FOUND", "Not found.", 404);
  return id;
}
