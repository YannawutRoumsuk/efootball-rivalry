"use client";

import { Languages, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/core";
import { applyTheme, THEME_COOKIE, type Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const YEAR = 60 * 60 * 24 * 365;
const setCookie = (name: string, value: string) => {
  document.cookie = `${name}=${value}; path=/; max-age=${YEAR}; samesite=lax`;
};

const button =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Switches TH ⇄ EN. Stored in a cookie so server-rendered pages use it too. */
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const next: Locale = locale === "th" ? "en" : "th";
  return (
    <button
      type="button"
      className={cn(button, className)}
      aria-label={t("toggle.languageAria")}
      onClick={() => {
        setCookie(LOCALE_COOKIE, next);
        document.documentElement.lang = next;
        router.refresh();
      }}
    >
      <Languages className="size-4" aria-hidden />
      <span className="font-medium">{next === "en" ? "EN" : "ไทย"}</span>
    </button>
  );
}

/** Light ⇄ dark. Applied instantly on <html> and remembered in a cookie. */
export function ThemeToggle({ initial, className }: { initial: Theme; className?: string }) {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>(initial);
  // The settings page can change the theme too; follow the cookie after a refresh.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setTheme(initial);
  }
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={cn(button, className)}
      aria-label={next === "light" ? t("toggle.toLight") : t("toggle.toDark")}
      onClick={() => {
        applyTheme(next);
        setCookie(THEME_COOKIE, next);
        setTheme(next);
      }}
    >
      {theme === "dark" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden />}
    </button>
  );
}
