"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createTranslator, type Locale, type Translate } from "./core";

const I18nContext = createContext<{ locale: Locale; t: Translate } | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(() => ({ locale, t: createTranslator(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function useT(): Translate {
  return useI18n().t;
}
