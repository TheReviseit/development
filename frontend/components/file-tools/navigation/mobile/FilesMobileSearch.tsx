"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Search, X, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { FILES_TOOL_SEARCH_INDEX, type FilesMegaTone } from "../files-navigation-data";
import { localizeFilesHref } from "../files-localized-href";
import styles from "../files-navigation.module.css";

const toneClass: Record<FilesMegaTone, string> = {
  blue: styles.toneBlue,
  coral: styles.toneCoral,
  green: styles.toneGreen,
  indigo: styles.toneIndigo,
  purple: styles.tonePurple,
  yellow: styles.toneYellow,
};

interface FilesMobileSearchProps {
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

export default function FilesMobileSearch({ onClose, triggerRef }: FilesMobileSearchProps) {
  const t = useTranslations("navbar");
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const localizedSearchIndex = useMemo(
    () =>
      FILES_TOOL_SEARCH_INDEX.map((tool) => ({
        ...tool,
        label: t(tool.labelKey),
        section: t(tool.sectionHeadingKey),
      })),
    [t],
  );

  const results = useMemo(() => {
    const source = normalizedQuery
      ? localizedSearchIndex.filter((tool) =>
          `${tool.label} ${tool.section}`.toLowerCase().includes(normalizedQuery),
        )
      : localizedSearchIndex.slice(0, 6);

    return source.slice(0, 8);
  }, [localizedSearchIndex, normalizedQuery]);

  useEffect(() => {
    const triggerElement = triggerRef.current;
    inputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      triggerElement?.focus();
    };
  }, [onClose, triggerRef]);

  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.18, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <motion.div
      id="files-mobile-search"
      className={styles.mobileSearchPanel}
      data-files-mobile-search
      initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      role="search"
      transition={transition}
    >
      <div className={styles.mobileSearchInner}>
        <label className={styles.mobileSearchField}>
          <Search size={18} aria-hidden="true" />
          <span className={styles.visuallyHidden}>{t("mobile.searchTools")}</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("mobile.searchPdfTools")}
            autoComplete="off"
            data-files-mobile-search-input
          />
          <button type="button" className={styles.mobileSearchClose} onClick={onClose} aria-label={t("closeSearch")}>
            <X size={18} aria-hidden="true" />
          </button>
        </label>

        <div className={styles.mobileSearchResults} aria-label={t("mobile.searchResults")}>
          {results.length > 0 ? (
            results.map((tool) => (
              <MobileSearchResult
                key={`${tool.sectionId}-${tool.id}`}
                href={localizeFilesHref(tool.href, pathname)}
                icon={tool.icon}
                label={tool.label}
                section={tool.section}
                tone={tool.tone}
                onNavigate={onClose}
              />
            ))
          ) : (
            <p className={styles.mobileSearchEmpty}>{t("mobile.noMatchingTools")}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function MobileSearchResult({
  href,
  icon: Icon,
  label,
  onNavigate,
  section,
  tone,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  onNavigate: () => void;
  section: string;
  tone: FilesMegaTone;
}) {
  return (
    <Link className={styles.mobileSearchResult} href={href} onClick={onNavigate}>
      <span className={`${styles.mobileSearchResultIcon} ${toneClass[tone]}`}>
        <Icon size={15} strokeWidth={2.4} aria-hidden="true" />
      </span>
      <span className={styles.mobileSearchResultText}>
        <span>{label}</span>
        <small>{section}</small>
      </span>
    </Link>
  );
}
