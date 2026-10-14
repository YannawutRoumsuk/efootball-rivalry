import { dateLocale, type Locale } from "@/lib/i18n/core";

const DATE_OPTS: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" };
const DATE_TIME_OPTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
};

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(locale: Locale, kind: "date" | "dateTime"): Intl.DateTimeFormat {
  const key = `${locale}:${kind}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(dateLocale(locale), kind === "date" ? DATE_OPTS : DATE_TIME_OPTS);
    formatters.set(key, f);
  }
  return f;
}

/** Match dates are day-precision values stored at 12:00 UTC. */
export function formatMatchDate(iso: string | null, locale: Locale = "en"): string | null {
  return iso ? formatter(locale, "date").format(new Date(iso)) : null;
}

export function formatTimestamp(iso: string, locale: Locale = "en"): string {
  return formatter(locale, "dateTime").format(new Date(iso));
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export function fmt(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export function pct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}
