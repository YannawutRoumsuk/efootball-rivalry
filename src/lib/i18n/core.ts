import { en } from "./en";
import { th } from "./th";

export const LOCALES = ["th", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "th";
export const LOCALE_COOKIE = "lang";

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
export type Params = Record<string, string | number>;
export type Translate = (key: MessageKey, params?: Params) => string;

const DICTIONARIES: Record<Locale, Messages> = { en, th };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function messagesFor(locale: Locale): Messages {
  return DICTIONARIES[locale];
}

/** `{name}` placeholders are replaced from params; unknown keys fall back to English, then the key. */
export function createTranslator(locale: Locale): Translate {
  const dict = DICTIONARIES[locale];
  return (key, params) => {
    const template = dict[key] ?? en[key] ?? key;
    return params ? template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : template;
  };
}

/** Date formatting per language (Thai uses the Buddhist calendar, as Thai readers expect). */
export function dateLocale(locale: Locale): string {
  return locale === "th" ? "th-TH" : "en-GB";
}
