const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Bangkok",
});

/** Match dates are day-precision values stored at 12:00 UTC. */
export function formatMatchDate(iso: string | null): string | null {
  return iso ? dateFmt.format(new Date(iso)) : null;
}

export function formatTimestamp(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
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
