import { defineRouting } from "next-intl/routing";
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, SUPPORTED_LOCALES } from "@/constants/languages";

export const routing = defineRouting({
  locales: SUPPORTED_LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localeCookie: {
    name: LOCALE_COOKIE_NAME,
    sameSite: "lax",
  },
  localeDetection: true,
  localePrefix: "always",
});
