import type { Season } from "@/lib/domain/seasons";
import { formatMatchDate } from "@/lib/format";
import { dateLocale, type Locale, type Translate } from "./core";

export function seasonName(season: Season, t: Translate): string {
  return season.key === "pre" ? t("season.pre") : t("season.n", { n: season.number });
}

/** "Oct–Dec 2026" for a quarter, "before 16 Oct 2026" for the pre-season. */
export function seasonPeriod(season: Season, t: Translate, locale: Locale): string {
  if (season.key === "pre") return season.endsAt ? t("season.preHint", { date: formatMatchDate(season.endsAt, locale)! }) : "";
  const [year, q] = season.key.split("-Q").map(Number);
  const month = new Intl.DateTimeFormat(dateLocale(locale), { month: "short", timeZone: "UTC" });
  const yearFmt = new Intl.DateTimeFormat(dateLocale(locale), { year: "numeric", timeZone: "UTC" });
  const from = new Date(Date.UTC(year, (q - 1) * 3, 15));
  const to = new Date(Date.UTC(year, (q - 1) * 3 + 2, 15));
  // Just the number ("2569"), without the era prefix Thai adds ("พ.ศ.").
  const year_ = yearFmt.formatToParts(to).find((p) => p.type === "year")?.value ?? String(year);
  return `${month.format(from)}–${month.format(to)} ${year_}`;
}
