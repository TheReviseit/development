"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import styles from "../store.module.css";
import { useCart } from "../context/CartContext";

interface StoreHeaderProps {
  storeName: string;
  logoUrl?: string;
  onSearchClick: () => void;
}

export default function StoreHeader({
  storeName,
  logoUrl,
  onSearchClick,
}: StoreHeaderProps) {
  const { cartCount, setIsCartOpen } = useCart();
  const router = useRouter();
  const params = useParams();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Get store initials for logo fallback
  const initials = storeName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header
      className={`${styles.header} ${isScrolled ? styles.headerScrolled : ""}`}
    >
      <div className={styles.headerInner}>
        <div className={styles.storeBrand}>
          <div className={styles.storeLogo}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={storeName}
                className={styles.storeLogoImg}
              />
            ) : (
              initials
            )}
          </div>
          <h1 className={styles.storeName}>{storeName}</h1>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.headerBtn}
            onClick={onSearchClick}
            aria-label="Search products"
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

          <button
            className={styles.headerBtn}
            onClick={() => router.push(`/store/${params.storeSlug}/track-order`)}
            aria-label="Track order"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </button>

          <button
            className={styles.headerBtn}
            onClick={() => setIsCartOpen(true)}
            aria-label="Open cart"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {cartCount > 0 && (
              <span className={styles.cartBadge}>
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
