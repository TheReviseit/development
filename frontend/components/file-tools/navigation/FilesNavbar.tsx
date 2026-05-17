"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { Menu, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import FilesDesktopNav from "./desktop/FilesDesktopNav";
import FilesMobileSearch from "./mobile/FilesMobileSearch";
import NavActions from "./shared/NavActions";
import NavLogo from "./shared/NavLogo";
import { FILES_NAV_ITEMS } from "./files-navigation-data";
import { localizeFilesHref } from "./files-localized-href";
import { useFilesNavigationState } from "./useFilesNavigationState";
import styles from "./files-navigation.module.css";

const FilesMobileDrawer = dynamic(() => import("./mobile/FilesMobileDrawer"), {
  ssr: false,
});

export default function FilesNavbar() {
  const t = useTranslations("navbar");
  const navRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const previousPathnameRef = useRef<string | null>(null);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const {
    activeMegaId,
    closeMega,
    closeMobile,
    isMobileOpen,
    isScrolled,
    openMega,
    pathname,
    toggleMega,
    toggleMobile,
  } = useFilesNavigationState();

  useEffect(() => {
    if (previousPathnameRef.current === null) {
      previousPathnameRef.current = pathname;
      return undefined;
    }

    if (previousPathnameRef.current === pathname) return undefined;
    previousPathnameRef.current = pathname;

    const timer = window.setTimeout(() => setIsMobileSearchOpen(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!activeMegaId) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      const nav = navRef.current;
      if (!nav || nav.contains(event.target as Node)) return;
      closeMega();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [activeMegaId, closeMega]);

  const toggleMobileSearch = () => {
    closeMega();
    closeMobile();
    setIsMobileSearchOpen((current) => !current);
  };

  const handleMobileMenuClick = () => {
    setIsMobileSearchOpen(false);
    toggleMobile();
  };

  return (
    <header
      ref={navRef}
      className={`${styles.navbar} ${isScrolled ? styles.navbarScrolled : ""}`}
      data-files-product-navbar
      data-files-navbar
    >
      <div className={styles.inner}>
        <NavLogo />

        <FilesDesktopNav
          activeMegaId={activeMegaId}
          closeMega={closeMega}
          openMega={openMega}
          pathname={pathname}
          toggleMega={toggleMega}
        />

        <nav className={styles.tabletNav} aria-label={t("quickTools")}>
          {FILES_NAV_ITEMS.filter((item) => item.tablet).map((item) => (
            <Link key={item.id} className={styles.tabletLink} href={localizeFilesHref(item.href, pathname)}>
              {t(item.shortLabelKey ?? item.labelKey)}
            </Link>
          ))}
        </nav>

        <div className={styles.rightCluster}>
          <NavActions />
          <button
            ref={searchButtonRef}
            type="button"
            className={styles.mobileSearchButton}
            aria-controls="files-mobile-search"
            aria-expanded={isMobileSearchOpen}
            aria-label={isMobileSearchOpen ? t("closeSearch") : t("openSearch")}
            onClick={toggleMobileSearch}
          >
            <Search size={20} strokeWidth={2.4} aria-hidden="true" />
          </button>
          <button
            ref={menuButtonRef}
            type="button"
            className={styles.menuButton}
            aria-controls="files-mobile-navigation"
            aria-expanded={isMobileOpen}
            aria-label={isMobileOpen ? t("closeNavigation") : t("openNavigation")}
            onClick={handleMobileMenuClick}
          >
            <Menu size={21} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMobileSearchOpen && (
          <FilesMobileSearch key="files-mobile-search" onClose={() => setIsMobileSearchOpen(false)} triggerRef={searchButtonRef} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMobileOpen && (
          <FilesMobileDrawer
            key="files-mobile-navigation"
            onClose={closeMobile}
            pathname={pathname}
            triggerRef={menuButtonRef}
          />
        )}
      </AnimatePresence>
    </header>
  );
}
