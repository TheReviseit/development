"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { FILES_MEGA_SECTIONS, FILES_NAV_ITEMS } from "../files-navigation-data";
import { isFilesPathActive, localizeFilesHref } from "../files-localized-href";
import FilesMegaMenu from "./FilesMegaMenu";
import styles from "../files-navigation.module.css";

interface FilesDesktopNavProps {
  activeMegaId: string | null;
  closeMega: () => void;
  openMega: (id: string) => void;
  pathname: string;
  toggleMega: (id: string) => void;
}

export default function FilesDesktopNav({
  activeMegaId,
  closeMega,
  openMega,
  pathname,
  toggleMega,
}: FilesDesktopNavProps) {
  const t = useTranslations("navbar");
  const activeMegaOpen = activeMegaId === "all-tools";
  const triggerId = "files-all-tools-trigger";
  const closeTimerRef = useRef<number | null>(null);

  const cancelCloseIntent = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const scheduleCloseIntent = useCallback(() => {
    cancelCloseIntent();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      closeMega();
    }, 220);
  }, [cancelCloseIntent, closeMega]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  return (
    <div className={styles.desktopNavShell} onMouseEnter={cancelCloseIntent} onMouseLeave={scheduleCloseIntent}>
      <nav className={styles.desktopNav} aria-label={t("tools")}>
        {FILES_NAV_ITEMS.map((item) => {
          const isActive = isFilesPathActive(pathname, item.href);
          const label = t(item.shortLabelKey ?? item.labelKey);

          if (item.megaId) {
            return (
              <button
                key={item.id}
                id={triggerId}
                type="button"
                className={styles.navLink}
                data-active={isActive ? "true" : "false"}
                aria-expanded={activeMegaOpen}
                aria-haspopup="menu"
                onClick={() => toggleMega(item.megaId!)}
                onFocus={() => openMega(item.megaId!)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openMega(item.megaId!);
                  }
                  if (event.key === "Escape") {
                    closeMega();
                  }
                }}
                onMouseEnter={() => {
                  cancelCloseIntent();
                  openMega(item.megaId!);
                }}
              >
                <span>{label}</span>
                <ChevronDown className={styles.navChevron} size={15} strokeWidth={2.4} aria-hidden="true" />
                {isActive && <motion.span className={styles.activeIndicator} layoutId="files-nav-active" />}
              </button>
            );
          }

          return (
            <Link
              key={item.id}
              className={styles.navLink}
              data-active={isActive ? "true" : "false"}
              href={localizeFilesHref(item.href, pathname)}
              aria-current={isActive ? "page" : undefined}
              onFocus={closeMega}
            >
              <span>{label}</span>
              {isActive && <motion.span className={styles.activeIndicator} layoutId="files-nav-active" />}
            </Link>
          );
        })}
      </nav>

      <AnimatePresence>
        {activeMegaOpen && (
          <FilesMegaMenu
            key="all-tools-mega-menu"
            labelledBy={triggerId}
            onClose={closeMega}
            onMouseEnter={cancelCloseIntent}
            onMouseLeave={scheduleCloseIntent}
            sections={FILES_MEGA_SECTIONS}
            pathname={pathname}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
