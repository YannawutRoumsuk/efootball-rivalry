import { ApiError } from "@/lib/api/envelope";
import { en } from "./en";
import type { MessageKey, Translate } from "./core";

/** Localised message for an API error: by error code when we have one, else the server's text. */
export function errorText(err: unknown, t: Translate, fallback: MessageKey = "api.INTERNAL"): string {
  if (err instanceof ApiError) {
    const key = `api.${err.code}` as MessageKey;
    return key in en ? t(key) : err.message || t(fallback);
  }
  return t(fallback);
}
