/**
 * Returns a same-origin relative path for post-login redirects, or "/".
 * Rejects protocol-relative (`//x`), backslash (`/\x`) and control-character
 * tricks that browsers normalise into an external URL.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return "/";
  const base = "http://same-origin.invalid";
  try {
    const url = new URL(next, base);
    if (url.origin !== base) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

/** Public origin of the request, honouring the reverse proxy in front of the app. */
export function requestOrigin(headers: Headers, fallback: string): string {
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host) return fallback;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return `${proto}://${host}`;
}
