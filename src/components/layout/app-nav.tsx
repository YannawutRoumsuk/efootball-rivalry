"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav-items";

/** Desktop: top bar. Mobile: bottom tab bar with a raised Upload button. */
export function AppNav({ roomName }: { roomName: string }) {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring" aria-label="Dashboard">
            <Logo />
          </Link>
          <span className="truncate text-sm text-muted-foreground">{roomName}</span>
          <nav aria-label="Main" className="ml-auto hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    item.primary
                      ? "ml-2 bg-player-a text-primary-foreground hover:bg-player-a/85"
                      : active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur-xl md:hidden"
      >
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
                    <span className="-mt-5 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-player-a to-player-b text-primary-foreground shadow-[0_8px_24px_-6px_var(--player-a)] ring-4 ring-background transition-transform active:scale-95">
                      <item.icon className="size-5" aria-hidden />
                    </span>
                  ) : (
                    <item.icon className={cn("size-5", active && "text-player-a")} aria-hidden />
                  )}
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
