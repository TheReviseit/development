"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const SCROLL_THRESHOLD = 12;

export function useFilesNavigationState() {
  const pathname = usePathname();
  const [activeMegaId, setActiveMegaId] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const isScrolledRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const previousPathnameRef = useRef(pathname);

  const openMega = useCallback((id: string) => {
    setActiveMegaId(id);
  }, []);

  const closeMega = useCallback(() => {
    setActiveMegaId(null);
  }, []);

  const toggleMega = useCallback((id: string) => {
    setActiveMegaId((current) => (current === id ? null : id));
  }, []);

  const openMobile = useCallback(() => {
    setIsMobileOpen(true);
    setActiveMegaId(null);
  }, []);

  const closeMobile = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  const toggleMobile = useCallback(() => {
    setIsMobileOpen((current) => {
      if (!current) setActiveMegaId(null);
      return !current;
    });
  }, []);

  useEffect(() => {
    const measureScroll = () => {
      frameRef.current = null;
      const nextScrolled = window.scrollY > SCROLL_THRESHOLD;
      if (isScrolledRef.current !== nextScrolled) {
        isScrolledRef.current = nextScrolled;
        setIsScrolled(nextScrolled);
      }
    };

    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(measureScroll);
    };

    measureScroll();
    window.addEventListener("scroll", schedule, { passive: true });

    return () => {
      window.removeEventListener("scroll", schedule);
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return undefined;
    previousPathnameRef.current = pathname;

    const timer = window.setTimeout(() => {
      setActiveMegaId(null);
      setIsMobileOpen(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!activeMegaId && !isMobileOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActiveMegaId(null);
      setIsMobileOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeMegaId, isMobileOpen]);

  return {
    activeMegaId,
    closeMega,
    closeMobile,
    isMobileOpen,
    isScrolled,
    openMega,
    openMobile,
    pathname,
    toggleMega,
    toggleMobile,
  };
}
