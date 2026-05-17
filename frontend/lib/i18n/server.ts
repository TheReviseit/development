import { DEFAULT_LOCALE, getLocaleMetadata, isSupportedLocale } from "@/constants/languages";
import type { Locale } from "@/types/i18n";

const LOCALE_PATH_RE = /^\/(en|ta|hi|ml|kn|te)(?=\/|$)/;

export function localeFromPathname(pathname: string): Locale | null {
  const match = pathname.match(LOCALE_PATH_RE);
  return isSupportedLocale(match?.[1]) ? match[1] : null;
}

export function stripLocaleFromPathname(pathname: string): string {
  const stripped = pathname.replace(LOCALE_PATH_RE, "");
  return stripped || "/";
}

export function localeFromHeaders(headersList: Headers): Locale {
  const nextIntlLocale = headersList.get("x-next-intl-locale");
  if (isSupportedLocale(nextIntlLocale)) return nextIntlLocale;

  const explicitLocale = headersList.get("x-flowauxi-locale");
  if (isSupportedLocale(explicitLocale)) return explicitLocale;

  return DEFAULT_LOCALE;
}

export function directionFromLocale(locale: string | null | undefined) {
  return getLocaleMetadata(locale).direction;
}
