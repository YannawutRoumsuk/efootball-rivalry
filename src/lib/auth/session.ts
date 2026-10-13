import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { sql } from "@/lib/db";
import { currentPinFingerprint } from "./pin";

import { SESSION_COOKIE_NAME } from "./cookie-name";

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
export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await sql()`
    insert into auth.sessions (id, user_id, expires_at, pin_hash)
    values (${hashToken(token)}, ${userId}, ${expires}, ${currentPinFingerprint()})`;
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expires));
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await sql()`delete from auth.sessions where id = ${hashToken(token)}`;
  store.delete(SESSION_COOKIE);
}

/** Signs the user out everywhere except (optionally) the current session. */
export async function revokeOtherSessions(userId: string): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const keep = token ? hashToken(token) : "";
  await sql()`delete from auth.sessions where user_id = ${userId} and id <> ${keep}`;
}

/** Validates the session cookie against the database (once per request). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;

  const id = hashToken(token);
  // A session only counts while APP_PIN is unchanged since it was created.
  const rows = await sql()<Array<{ user_id: string; email: string; expires_at: Date }>>`
    select s.user_id, u.email, s.expires_at
    from auth.sessions s join auth.users u on u.id = s.user_id
    where s.id = ${id} and s.expires_at > now()
      and s.pin_hash is not distinct from ${currentPinFingerprint()}`;
  const row = rows[0];
  if (!row) return null;

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
