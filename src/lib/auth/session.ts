import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { sql } from "@/lib/db";
import { SESSION_COOKIE_NAME } from "./cookie-name";
import { pinFingerprint, pinForSeat } from "./pin";
import { SEAT_ORDER_SQL } from "./players";

export const SESSION_COOKIE = SESSION_COOKIE_NAME;
const SESSION_DAYS = 30;
const RENEW_WHEN_DAYS_LEFT = 15;

export interface SessionUser {
  id: string;
  email: string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Creates a session row (only the token's hash is stored) and sets the cookie. */
export async function startSession(userId: string, pinHash: string | null): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql()`
    insert into auth.sessions (id, user_id, expires_at, pin_hash)
    values (${hashToken(token)}, ${userId}, ${expires}, ${pinHash})`;
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expires));
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await sql()`delete from auth.sessions where id = ${hashToken(token)}`;
  store.delete(SESSION_COOKIE);
}

/** Validates the session cookie against the database (once per request). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;

  const id = hashToken(token);
  const db = sql();
  const rows = await db<Array<{ user_id: string; email: string; expires_at: Date; pin_hash: string | null; seat: number | null }>>`
    select s.user_id, u.email, s.expires_at, s.pin_hash,
      (select x.seat from (
         select m.user_id, row_number() over (order by ${db.unsafe(SEAT_ORDER_SQL)})::int as seat
         from public.rivalry_members m
         where m.rivalry_id = (select id from public.rivalries order by created_at limit 1)
       ) x where x.user_id = s.user_id) as seat
    from auth.sessions s join auth.users u on u.id = s.user_id
    where s.id = ${id} and s.expires_at > now()`;
  const row = rows[0];
  if (!row) return null;

  // A session only counts while that player's PIN is unchanged since sign-in.
  const pin = pinForSeat(row.seat);
  if (!pin || row.pin_hash !== pinFingerprint(row.user_id, pin)) return null;

  // Sliding expiry: renew long-lived sessions occasionally, not on every request.
  if (row.expires_at.getTime() - Date.now() < RENEW_WHEN_DAYS_LEFT * 86_400_000) {
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await sql()`update auth.sessions set expires_at = ${expires} where id = ${id}`;
    try {
      store.set(SESSION_COOKIE, token, cookieOptions(expires));
    } catch {
      // Server Components can't set cookies; the next route handler call will.
    }
  }
  return { id: row.user_id, email: row.email };
});

/** Sliding-window limiter for login/signup attempts (keyed by email and IP). */
export async function allowAttempt(keys: string[], max: number, windowSeconds: number): Promise<boolean> {
  const db = sql();
  const counts = await db<Array<{ key: string; n: number }>>`
    select key, count(*)::int as n from auth.login_attempts
    where key in ${db(keys)} and created_at > now() - make_interval(secs => ${windowSeconds})
    group by key`;
  if (counts.some((c) => c.n >= max)) return false;
  await db`insert into auth.login_attempts ${db(keys.map((key) => ({ key })))}`;
  await db`delete from auth.login_attempts where created_at < now() - interval '1 day'`;
  return true;
}
