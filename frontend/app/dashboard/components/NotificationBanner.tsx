"use client";

import { useState } from "react";
import { usePushNotification } from "@/app/hooks/usePushNotification";
import styles from "../dashboard.module.css";

interface NotificationBannerProps {
  onDismiss?: () => void;
}

/**
 * Banner component prompting users to enable push notifications
 * Only shows when permission is 'default' (not yet asked)
 */
export default function NotificationBanner({
  onDismiss,
}: NotificationBannerProps) {
  const { isSupported, isSubscribed, isLoading, permissionStatus, subscribe } =
    usePushNotification();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Don't show if:
  // - Not supported
  // - Already subscribed
  // - Permission denied (can't ask again)
  // - User dismissed
  // - Still loading initial state
  if (
    !isSupported ||
    isSubscribed ||
    permissionStatus === "denied" ||
    isDismissed ||
    isLoading
  ) {
    return null;
  }

  const handleEnable = async () => {
    setIsSubscribing(true);
    const success = await subscribe();
    setIsSubscribing(false);

    if (success) {
      // Banner will auto-hide due to isSubscribed becoming true
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    // Store dismissal in localStorage so it persists
    localStorage.setItem("notification_banner_dismissed", "true");
    onDismiss?.();
  };

  return (
    <div className={styles.notificationBanner}>
      <div className={styles.notificationBannerContent}>
        <div className={styles.notificationBannerIcon}>
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </div>
        <div className={styles.notificationBannerText}>
          <strong>Enable notifications</strong>
          <span>Get notified instantly when new messages arrive</span>
        </div>
      </div>
      <div className={styles.notificationBannerActions}>
        <button
          onClick={handleDismiss}
          className={styles.notificationBannerDismiss}
        >
          Not now
        </button>
        <button
          onClick={handleEnable}
          disabled={isSubscribing}
          className={styles.notificationBannerEnable}
        >
          {isSubscribing ? "Enabling..." : "Enable"}
        </button>
      </div>
    </div>
  );
}
