import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { createTranslator, DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale, type Translate } from "./core";

export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

export async function getT(): Promise<Translate> {
  return createTranslator(await getLocale());
}
