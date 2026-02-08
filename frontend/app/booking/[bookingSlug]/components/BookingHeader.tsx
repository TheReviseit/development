"use client";

import React from "react";
import Image from "next/image";
import styles from "../booking.module.css";

// ============================================================
// Types
// ============================================================
interface BookingHeaderProps {
  businessName: string;
  logoUrl?: string;
  onBackClick?: () => void;
  showBack?: boolean;
}

// ============================================================
// BookingHeader Component
// ============================================================
export default function BookingHeader({
  businessName,
  logoUrl,
  onBackClick,
  showBack = false,
}: BookingHeaderProps) {
  return (
    <header className={styles.bookingHeader}>
      <div className={styles.headerContent}>
        {/* Back Button (optional) */}
        {showBack && onBackClick && (
          <button
            className={styles.headerBackBtn}
            onClick={onBackClick}
            aria-label="Go back"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {/* Logo & Business Name */}
        <div className={styles.headerBrand}>
          {logoUrl ? (
            <div className={styles.headerLogo}>
              <Image
                src={logoUrl}
                alt={businessName}
                width={40}
                height={40}
                className={styles.logoImg}
              />
            </div>
          ) : (
            <div className={styles.headerLogoPlaceholder}>
              <span>{businessName.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <h1 className={styles.headerTitle}>{businessName}</h1>
        </div>

        {/* Spacer for alignment */}
        <div className={styles.headerSpacer} />
      </div>
    </header>
  );
}
