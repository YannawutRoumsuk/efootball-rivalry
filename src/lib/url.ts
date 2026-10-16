type SearchParams = Record<string, string | string[] | undefined>;

/** `path?…` keeping the current string params, with `patch` applied (null removes a key). */
export function hrefWith(path: string, current: SearchParams, patch: Record<string, string | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) if (typeof v === "string" && !Object.hasOwn(patch, k)) sp.set(k, v);
  for (const [k, v] of Object.entries(patch)) if (v !== null) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}
