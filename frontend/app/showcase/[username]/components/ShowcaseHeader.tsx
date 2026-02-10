"use client";

import React, { useState, useEffect } from "react";
import styles from "../page.module.css";

interface ShowcaseHeaderProps {
  businessName: string;
  logoUrl?: string;
  onSearchClick: () => void;
}

export default function ShowcaseHeader({
  businessName,
  logoUrl,
  onSearchClick,
}: ShowcaseHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Get business initials for logo fallback
  const initials = businessName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header
      className={`${styles.showcaseHeader} ${isScrolled ? styles.headerScrolled : ""}`}
    >
      <div className={styles.showcaseHeaderInner}>
        <div className={styles.showcaseBrand}>
          <div className={styles.showcaseLogo}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={businessName}
                className={styles.showcaseLogoImg}
              />
            ) : (
              initials
            )}
          </div>
          <h1 className={styles.showcaseName}>{businessName}</h1>
        </div>

        <div className={styles.showcaseHeaderActions}>
          <button
            className={styles.showcaseHeaderBtn}
            onClick={onSearchClick}
            aria-label="Search items"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
