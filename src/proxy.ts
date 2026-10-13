import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie-name";

const PUBLIC_PATHS = ["/login", "/setup", "/offline"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Cheap routing gate: sends visitors without a session cookie to /login.
 * The cookie is validated against the database by every page and API route,
 * so this is a UX redirect, not the security boundary.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!process.env.DATABASE_URL) {
    return pathname === "/setup" ? NextResponse.next() : NextResponse.redirect(new URL("/setup", request.url));
  }

  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!hasSession && !isPublicPath(pathname)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip API routes (they authenticate themselves), Next internals and static assets.
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
