"use client";

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { LayoutGrid, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  FILES_MEGA_SECTIONS,
  FILES_MOBILE_PRIMARY_ITEMS,
  FILES_TOOL_SEARCH_INDEX,
  type FilesMegaTone,
} from "../files-navigation-data";
import { isFilesPathActive, localizeFilesHref } from "../files-localized-href";
import NavActions from "../shared/NavActions";
import NavLogo from "../shared/NavLogo";
import styles from "../files-navigation.module.css";

const toneClass: Record<FilesMegaTone, string> = {
  blue: styles.toneBlue,
  coral: styles.toneCoral,
  green: styles.toneGreen,
  indigo: styles.toneIndigo,
  purple: styles.tonePurple,
  yellow: styles.toneYellow,
};

interface FilesMobileDrawerProps {
  onClose: () => void;
  pathname: string;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

export default function FilesMobileDrawer({ onClose, pathname, triggerRef }: FilesMobileDrawerProps) {
  const t = useTranslations("navbar");
  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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

  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return localizedSearchIndex.filter((tool) =>
      `${tool.label} ${tool.section}`.toLowerCase().includes(normalizedQuery),
    ).slice(0, 8);
  }, [localizedSearchIndex, normalizedQuery]);

  useEffect(() => {
    const drawer = drawerRef.current;
    const triggerElement = triggerRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const inertTargets = Array.from(
      document.querySelectorAll<HTMLElement>("[data-files-product-content], [data-files-product-footer]"),
    );

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    inertTargets.forEach((target) => {
      target.setAttribute("aria-hidden", "true");
      target.inert = true;
    });
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !drawer) return;
      const focusable = getFocusableElements(drawer);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      inertTargets.forEach((target) => {
        target.removeAttribute("aria-hidden");
        target.inert = false;
      });
      document.removeEventListener("keydown", handleKeyDown);
      triggerElement?.focus();
    };
  }, [onClose, triggerRef]);

  const drawerTransition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <>
      <motion.div
        className={styles.mobileBackdrop}
        data-files-mobile-backdrop
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={drawerTransition}
        onMouseDown={onClose}
      />
      <motion.aside
        ref={drawerRef}
        id="files-mobile-navigation"
        aria-labelledby={titleId}
        aria-modal="true"
        className={styles.mobileDrawer}
        data-files-mobile-drawer
        initial={prefersReducedMotion ? { opacity: 1 } : { x: "100%" }}
        animate={prefersReducedMotion ? { opacity: 1 } : { x: 0 }}
        exit={prefersReducedMotion ? { opacity: 0 } : { x: "100%" }}
        role="dialog"
        transition={drawerTransition}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.drawerHeader}>
          <NavLogo />
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.drawerClose}
            onClick={onClose}
            aria-label={t("closeNavigation")}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className={styles.drawerBody}>
          <div>
            <p className={styles.drawerEyebrow} id={titleId}>
              {t("mobile.filesNavigation")}
            </p>
            <label className={styles.drawerSearch}>
              <Search size={17} aria-hidden="true" />
              <span className={styles.visuallyHidden}>{t("mobile.searchTools")}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("mobile.searchPlaceholder")}
                autoComplete="off"
              />
            </label>
          </div>

          {normalizedQuery ? (
            <div className={styles.drawerSection}>
              <h3 className={styles.drawerSectionTitle}>{t("mobile.searchResults")}</h3>
              <div className={styles.drawerToolList}>
                {searchResults.length > 0 ? (
                  searchResults.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <Link key={`${tool.sectionId}-${tool.id}`} className={styles.drawerToolLink} href={localizeFilesHref(tool.href, pathname)} onClick={onClose}>
                        <span className={`${styles.drawerToolIcon} ${toneClass[tool.tone]}`}>
                          <Icon size={15} aria-hidden="true" />
                        </span>
                        <span>{tool.label}</span>
                      </Link>
                    );
                  })
                ) : (
                  <p className={styles.drawerEmpty}>{t("mobile.noMatchingTools")}</p>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className={styles.drawerSection}>
                <h3 className={styles.drawerSectionTitle}>{t("mobile.popular")}</h3>
                <div className={styles.drawerPrimaryList}>
                  {FILES_MOBILE_PRIMARY_ITEMS.map((item) => (
                    <Link
                      key={item.id}
                      className={styles.drawerPrimaryLink}
                      data-active={isFilesPathActive(pathname, item.href) ? "true" : "false"}
                      href={localizeFilesHref(item.href, pathname)}
                      onClick={onClose}
                    >
                      {t(item.labelKey)}
                    </Link>
                  ))}
                  <Link className={styles.drawerPrimaryLink} href={localizeFilesHref("/tools", pathname)} onClick={onClose}>
                    <LayoutGrid size={17} aria-hidden="true" />
                    {t("nav.allTools")}
                  </Link>
                </div>
              </div>

              {FILES_MEGA_SECTIONS.map((section) => (
                <div className={styles.drawerSection} key={section.id}>
                  <h3 className={styles.drawerSectionTitle}>{t(section.headingKey)}</h3>
                  <div className={styles.drawerToolList}>
                    {section.tools.map((tool) => {
                      const Icon = tool.icon;
                      const label = t(tool.labelKey);

                      return (
                        <Link key={`${section.id}-${tool.id}`} className={styles.drawerToolLink} href={localizeFilesHref(tool.href, pathname)} onClick={onClose}>
                          <span className={`${styles.drawerToolIcon} ${toneClass[tool.tone]}`}>
                            <Icon size={15} aria-hidden="true" />
                          </span>
                          <span>{label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className={styles.drawerFooter}>
          <NavActions variant="drawer" onNavigate={onClose} />
        </div>
      </motion.aside>
    </>
  );
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
}
