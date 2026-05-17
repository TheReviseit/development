import type { Locale, LocaleMetadata } from "@/types/i18n";

export const DEFAULT_LOCALE: Locale = "en";

export const SUPPORTED_LOCALES = ["en", "ta", "hi", "ml", "kn", "te"] as const;

export const LOCALE_COOKIE_NAME = "FLOWAUXI_LOCALE";

export const LOCALE_METADATA: Record<Locale, LocaleMetadata> = {
  en: {
    code: "en",
    englishName: "English",
    nativeName: "English",
    script: "Latin",
    direction: "ltr",
    pdfFont: "NotoSans",
    translationProviderPreference: "libretranslate",
    seoSlugBehavior: "source",
    enabled: true,
  },
  ta: {
    code: "ta",
    englishName: "Tamil",
    nativeName: "தமிழ்",
    script: "Tamil",
    direction: "ltr",
    pdfFont: "NotoSansTamil",
    translationProviderPreference: "indictrans2",
    seoSlugBehavior: "localized",
    enabled: true,
  },
  hi: {
    code: "hi",
    englishName: "Hindi",
    nativeName: "हिन्दी",
    script: "Devanagari",
    direction: "ltr",
    pdfFont: "NotoSansDevanagari",
    translationProviderPreference: "indictrans2",
    seoSlugBehavior: "localized",
    enabled: true,
  },
  ml: {
    code: "ml",
    englishName: "Malayalam",
    nativeName: "മലയാളം",
    script: "Malayalam",
    direction: "ltr",
    pdfFont: "NotoSansMalayalam",
    translationProviderPreference: "indictrans2",
    seoSlugBehavior: "localized",
    enabled: true,
  },
  kn: {
    code: "kn",
    englishName: "Kannada",
    nativeName: "ಕನ್ನಡ",
    script: "Kannada",
    direction: "ltr",
    pdfFont: "NotoSansKannada",
    translationProviderPreference: "indictrans2",
    seoSlugBehavior: "localized",
    enabled: true,
  },
  te: {
    code: "te",
    englishName: "Telugu",
    nativeName: "తెలుగు",
    script: "Telugu",
    direction: "ltr",
    pdfFont: "NotoSansTelugu",
    translationProviderPreference: "indictrans2",
    seoSlugBehavior: "localized",
    enabled: true,
  },
};

export function isSupportedLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && SUPPORTED_LOCALES.includes(value as Locale));
}

export function getLocaleMetadata(locale: string | null | undefined): LocaleMetadata {
  return LOCALE_METADATA[isSupportedLocale(locale) ? locale : DEFAULT_LOCALE];
}
