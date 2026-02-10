/**
 * Shop Migration Banner Component
 *
 * Displays a notification to users that shop features have moved
 * to shop.flowauxi.com for 30-90 days.
 *
 * Auto-dismisses when:
 * - User clicks "Got it"
 * - User is already on shop.flowauxi.com
 */

"use client";

import { useState, useEffect } from "react";
import styles from "./ShopMigrationBanner.module.css";

const BANNER_STORAGE_KEY = "shop-migration-banner-dismissed";
const BANNER_EXPIRY_DAYS = 90; // Show for 90 days max

export function ShopMigrationBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Check if already dismissed
    const dismissedData = localStorage.getItem(BANNER_STORAGE_KEY);

    if (dismissedData) {
      try {
        const { timestamp } = JSON.parse(dismissedData);
        const daysSinceDismissed =
          (Date.now() - timestamp) / (1000 * 60 * 60 * 24);

        // Reset if expired
        if (daysSinceDismissed > BANNER_EXPIRY_DAYS) {
          localStorage.removeItem(BANNER_STORAGE_KEY);
        } else {
          return; // Still dismissed
        }
      } catch {
        // Invalid data, show banner
      }
    }

    // Don't show if already on shop domain
    const hostname = window.location.hostname;
    if (hostname.includes("shop.flowauxi.com")) {
      handleAutoDismiss();
      return;
    }

    // Show banner
    setVisible(true);
  }, []);

  const handleDismiss = () => {
    const dismissData = {
      timestamp: Date.now(),
      dismissed: true,
    };
    localStorage.setItem(BANNER_STORAGE_KEY, JSON.stringify(dismissData));
    setVisible(false);
  };

  const handleAutoDismiss = () => {
    // Silent dismiss when on shop domain
    const dismissData = {
      timestamp: Date.now(),
      dismissed: true,
      auto: true,
    };
    localStorage.setItem(BANNER_STORAGE_KEY, JSON.stringify(dismissData));
  };

  if (!visible) return null;

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.content}>
        <div className={styles.icon}>📦</div>
        <div className={styles.message}>
          <strong>Shop features have moved!</strong>
          <span>
            Your shop dashboard is now at{" "}
            <a
              href="https://shop.flowauxi.com/dashboard"
              className={styles.link}
            >
              shop.flowauxi.com
            </a>{" "}
            for a better, faster experience.
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className={styles.dismissBtn}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
    </div>
  );
}
