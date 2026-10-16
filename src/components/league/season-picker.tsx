import Link from "next/link";
import type { Scope, Season } from "@/lib/domain/seasons";
import { getLocale, getT } from "@/lib/i18n/server";
import { seasonName, seasonPeriod } from "@/lib/i18n/seasons";
import { cn } from "@/lib/utils";

interface SeasonPickerProps {
  seasons: Season[];
  scope: Scope;
  /** Link for a scope, keeping the page's other filters. */
  hrefs: Record<Scope, string>;
}

const chip = "flex h-auto min-h-10 shrink-0 flex-col justify-center rounded-lg border px-3 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Season chips (newest first, pre-season last) plus "all seasons". Lives in the URL as ?season=. */
export async function SeasonPicker({ seasons, scope, hrefs }: SeasonPickerProps) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const options: Array<{ key: Scope; name: string; sub: string }> = [
    ...seasons.map((s) => ({ key: s.key as Scope, name: seasonName(s, t), sub: s.current ? `${seasonPeriod(s, t, locale)} · ${t("season.current")}` : seasonPeriod(s, t, locale) })),
    { key: "all", name: t("season.all"), sub: "" },
  ];
  return (
    <nav aria-label={t("season.label")} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {options.map((o) => {
        const active = o.key === scope;
        return (
          <Link
            key={o.key}
            href={hrefs[o.key]}
            scroll={false}
            aria-current={active ? "page" : undefined}
            className={cn(chip, active ? "border-foreground/40 bg-accent" : "text-muted-foreground hover:border-foreground/25 hover:text-foreground")}
          >
            <span className="text-sm font-medium whitespace-nowrap">{o.name}</span>
            {o.sub && <span className="text-xs whitespace-nowrap text-muted-foreground">{o.sub}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
