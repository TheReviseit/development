"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LOCALE_METADATA, SUPPORTED_LOCALES } from "@/constants/languages";
import type { Locale } from "@/types/i18n";
import { currentFilesLocale, filesHrefForLocale } from "../files-localized-href";
import styles from "../files-navigation.module.css";

interface LanguageSwitcherProps {
  onNavigate?: () => void;
  variant?: "desktop" | "drawer";
}

export default function LanguageSwitcher({
  onNavigate,
  variant = "desktop",
}: LanguageSwitcherProps) {
  const t = useTranslations("common");
  const pathname = usePathname();
  const currentLocale = currentFilesLocale(pathname);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isDrawer = variant === "drawer";

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root || root.contains(event.target as Node)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleNavigate = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div
      ref={rootRef}
      className={isDrawer ? styles.drawerLanguageSwitcher : styles.languageSwitcher}
    >
      <button
        type="button"
        className={isDrawer ? styles.drawerLanguageButton : styles.languageButton}
        aria-label={t("language")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Languages size={18} strokeWidth={2.3} aria-hidden="true" />
        {isDrawer && <span>{t("language")}</span>}
      </button>

      {open && (
        <div
          className={isDrawer ? styles.drawerLanguageMenu : styles.languageMenu}
          role="menu"
        >
          {SUPPORTED_LOCALES.map((locale) => (
            <LanguageOption
              key={locale}
              locale={locale}
              currentLocale={currentLocale}
              href={filesHrefForLocale(pathname, locale)}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LanguageOption({
  locale,
  currentLocale,
  href,
  onNavigate,
}: {
  locale: Locale;
  currentLocale: Locale;
  href: string;
  onNavigate: () => void;
}) {
  const metadata = LOCALE_METADATA[locale];
  const active = locale === currentLocale;

  return (
    <Link
      className={styles.languageOption}
      href={href}
      hrefLang={locale}
      role="menuitemradio"
      aria-checked={active}
      data-active={active ? "true" : "false"}
      onClick={onNavigate}
    >
      <span className={styles.languageNativeName}>{metadata.nativeName}</span>
      <span className={styles.languageEnglishName}>{metadata.englishName}</span>
    </Link>
  );
}
