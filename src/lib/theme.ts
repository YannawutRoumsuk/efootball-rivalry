export const THEME_COOKIE = "theme";
export type Theme = "light" | "dark";
export const DEFAULT_THEME: Theme = "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/** Client-only: switches the <html> class that the CSS tokens key off. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

