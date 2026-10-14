"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { useT } from "@/lib/i18n/client";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav-items";
import { LanguageToggle, ThemeToggle } from "./preference-toggles";

/** Desktop: top bar. Mobile: compact top bar + bottom tab bar. */
export function AppNav({ roomName, theme }: { roomName: string; theme: Theme }) {
  const pathname = usePathname();
  const t = useT();

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("nav.dashboard")}>
            <Logo />
          </Link>
          <span className="hidden truncate text-sm text-muted-foreground sm:inline">{roomName}</span>
          <nav aria-label={t("nav.main")} className="ml-auto hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    item.primary
                      ? "mx-1 bg-primary text-primary-foreground hover:bg-primary/90"
                      : active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  {t(item.label)}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center md:ml-2">
            <LanguageToggle />
            <ThemeToggle initial={theme} />
          </div>
        </div>
      </header>

      <nav aria-label={t("nav.main")} className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5 px-2 pt-1.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href} className="flex justify-center">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-xl text-[0.68rem] font-medium transition-colors",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {item.primary ? (
                    <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95">
                      <item.icon className="size-5" aria-hidden />
                    </span>
                  ) : (
                    <item.icon className="size-5" aria-hidden />
                  )}
                  <span>{t(item.label)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
