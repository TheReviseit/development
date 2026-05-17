export type Locale = "en" | "ta" | "hi" | "ml" | "kn" | "te";

export type LocaleDirection = "ltr" | "rtl";

export type LocaleScript =
  | "Latin"
  | "Tamil"
  | "Devanagari"
  | "Malayalam"
  | "Kannada"
  | "Telugu";

export type TranslationProviderPreference =
  | "libretranslate"
  | "indictrans2"
  | "manual";

export interface LocaleMetadata {
  code: Locale;
  englishName: string;
  nativeName: string;
  script: LocaleScript;
  direction: LocaleDirection;
  pdfFont: string;
  translationProviderPreference: TranslationProviderPreference;
  seoSlugBehavior: "source" | "localized";
  enabled: boolean;
}
