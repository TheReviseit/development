import { DEFAULT_LOCALE, isSupportedLocale } from "@/constants/languages";
import type { Locale } from "@/types/i18n";

const localePrefixPattern = /^\/([^/]+)(?=\/|$)/;
const legacyFilesPathPattern = /^\/files(?=\/|$)/;

export const publicToolsBasePath = "/tools";

export function normalizeFilesProductHref(href: string): string {
  if (href === "/files" || href.startsWith("/files/")) {
    return href.replace(legacyFilesPathPattern, publicToolsBasePath);
  }
  return href;
}

export function getLocalePrefix(pathname: string): string {
  const locale = pathname.match(localePrefixPattern)?.[1];
  return isSupportedLocale(locale) ? `/${locale}` : "";
}

export function stripLocalePrefix(pathname: string): string {
  const localePrefix = getLocalePrefix(pathname);
  if (!localePrefix) return pathname;
  return pathname.slice(localePrefix.length) || "/";
}

export function localizeFilesHref(href: string, pathname: string): string {
  const normalizedHref = normalizeFilesProductHref(href);
  if (!normalizedHref.startsWith(publicToolsBasePath)) return href;
  return `${getLocalePrefix(pathname)}${normalizedHref}`;
}

export function filesHrefForLocale(pathname: string, locale: Locale): string {
  const normalizedPathname = normalizeFilesProductHref(stripLocalePrefix(pathname));
  const toolsPath = normalizedPathname.startsWith(publicToolsBasePath)
    ? normalizedPathname
    : publicToolsBasePath;
  return `/${locale}${toolsPath}`;
}

export function currentFilesLocale(pathname: string): Locale {
  const locale = pathname.match(localePrefixPattern)?.[1];
  return isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function isFilesPathActive(pathname: string, href: string) {
  const normalizedPathname = normalizeFilesProductHref(stripLocalePrefix(pathname));
  const normalizedHref = normalizeFilesProductHref(href);
  if (normalizedHref === publicToolsBasePath) return normalizedPathname === publicToolsBasePath;
  return normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`);
}
