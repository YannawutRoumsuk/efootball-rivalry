import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, type ApiResult } from "./envelope";

export function ok<T>(data: T, status = 200): NextResponse<ApiResult<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(code: string, message: string, status: number, details?: unknown) {
  return NextResponse.json<ApiResult<never>>({ ok: false, error: { code, message, details } }, { status });
}

/** Friendly messages for the exception codes raised by the database RPCs. */
const DB_ERRORS: Record<string, { status: number; message: string }> = {
  NOT_AUTHENTICATED: { status: 401, message: "Please sign in again." },
  FORBIDDEN: { status: 403, message: "You are not a member of this rivalry." },
  ALREADY_IN_RIVALRY: { status: 409, message: "You are already in a rivalry room." },
  NOT_IN_RIVALRY: { status: 409, message: "Create or join a rivalry room first." },
  RIVALRY_FULL: { status: 409, message: "This rivalry room already has two players." },
  RIVALRY_INCOMPLETE: { status: 409, message: "Your friend needs to join the room before matches can be saved." },
  RIVALRY_HAS_MATCHES: { status: 409, message: "You can't leave a rivalry that already has matches." },
  INVITE_INVALID: { status: 404, message: "That invite code is not valid." },
  INVITE_USED: { status: 409, message: "That invite code has already been used." },
  INVITE_EXPIRED: { status: 410, message: "That invite code has expired. Ask for a new one." },
  INVALID_TTL: { status: 400, message: "Invalid invite expiry." },
  INVALID_SIDES: { status: 400, message: "A match needs one left and one right side with two different players." },
  PLAYER_NOT_IN_RIVALRY: { status: 400, message: "Both players must be members of this rivalry." },
  MATCH_REQUIRES_TWO_SIDES: { status: 400, message: "A match must have exactly two sides." },
  UPLOAD_NOT_AVAILABLE: { status: 409, message: "This screenshot is already attached to another match." },
  MATCH_NOT_FOUND: { status: 404, message: "Match not found." },
  MATCH_VOID: { status: 409, message: "Restore this match before editing it." },
  INVALID_TRANSITION: { status: 409, message: "That action isn't possible for the match's current status." },
  INVALID_ACTION: { status: 400, message: "Unknown action." },
  NOTE_REQUIRED: { status: 400, message: "Please add a short reason." },
};

interface PostgrestLikeError {
  message?: string;
  code?: string;
  details?: string | null;
}

/** Converts a PostgreSQL error into an ApiError with a safe message (raw details are only logged). */
export function toApiError(error: PostgrestLikeError, fallback = "Database request failed."): ApiError {
  const raw = error.message ?? "";
  const known = Object.keys(DB_ERRORS).find((code) => raw.includes(code));
  if (known) {
    const { status, message } = DB_ERRORS[known];
    return new ApiError(known, message, status);
  }
  if (error.code === "23514" || error.code === "23502") {
    return new ApiError("CONSTRAINT", "Some values are invalid. Please check the statistics.", 400);
  }
  if (error.code === "23505") return new ApiError("CONFLICT", "That record already exists.", 409);
  if (error.code === "42501") return new ApiError("FORBIDDEN", "You don't have access to this.", 403);
  console.error("[db]", error.code, raw, error.details);
  return new ApiError("DB_ERROR", fallback, 500);
}

export async function parseJson<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError("BAD_JSON", "Request body must be valid JSON.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request.";
    throw new ApiError("VALIDATION", message, 400, parsed.error.issues.map((i) => i.message));
  }
  return parsed.data;
}

/** First hop of X-Forwarded-For (set by Railway's edge), for rate-limit keys only. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * CSRF defence in depth (cookies are already SameSite=Lax): state-changing
 * requests must come from this site.
 */
function assertSameOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD") return;
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError("BAD_ORIGIN", "Request origin not allowed.", 403);
  }
  if (!host || originHost !== host.split(",")[0].trim()) {
    throw new ApiError("BAD_ORIGIN", "Request origin not allowed.", 403);
  }
}

/** Wraps a route handler so thrown ApiErrors become envelope responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      if (args[0] instanceof Request) assertSameOrigin(args[0]);
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return fail(err.code, err.message, err.status, err.details);
      console.error("[api] unhandled", err);
      return fail("INTERNAL", "Something went wrong. Please try again.", 500);
    }
  };
}
