"use client";

import { useState, useEffect } from "react";
import { usePushNotification } from "@/app/hooks/usePushNotification";
import styles from "../dashboard.module.css";

interface NotificationBannerProps {
  onDismiss?: () => void;
}

/**
 * Banner component prompting users to enable push notifications
 * Shows when permission is 'default' (not yet asked) or 'denied' (blocked)
 */
export default function NotificationBanner({
  onDismiss,
}: NotificationBannerProps) {
  const { isSupported, isSubscribed, isLoading, permissionStatus, subscribe } =
    usePushNotification();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  // Check if user previously dismissed the banner
  useEffect(() => {
    const wasDismissed = localStorage.getItem("notification_banner_dismissed");
    if (wasDismissed === "true") {
      setIsDismissed(true);
    }
  }, []);

  // Debug logging to help troubleshoot banner visibility
  useEffect(() => {
    console.log("🔔 NotificationBanner state:", {
      isSupported,
      isSubscribed,
      isLoading,
      permissionStatus,
      isDismissed,
    });
  }, [isSupported, isSubscribed, isLoading, permissionStatus, isDismissed]);

  // Auto-subscribe when permission is granted but not yet subscribed
  // This handles the case where permission was granted but FCM token wasn't saved
  useEffect(() => {
    const autoSubscribe = async () => {
      if (
        isSupported &&
        !isSubscribed &&
        !isLoading &&
        permissionStatus === "granted"
      ) {
        console.log(
          "🔔 Auto-subscribing: permission granted but not subscribed"
        );
        const success = await subscribe();
        if (success) {
          console.log("✅ Auto-subscribe successful");
        } else {
          console.log("❌ Auto-subscribe failed");
        }
      }
    };

    autoSubscribe();
  }, [isSupported, isSubscribed, isLoading, permissionStatus, subscribe]);

  // Don't show if:
  // - Not supported
  // - Already subscribed
  // - Permission already granted (user already allowed notifications)
  // - User dismissed
  // - Still loading initial state
  if (
    !isSupported ||
    isSubscribed ||
    permissionStatus === "granted" ||
    isDismissed ||
    isLoading
  ) {
    return null;
  }

  // Only show for 'default' (not asked yet) or 'denied' (blocked)

  const isDenied = permissionStatus === "denied";

  const handleEnable = async () => {
    setIsSubscribing(true);

    try {
      // First, directly request browser notification permission
      console.log("🔔 Requesting notification permission...");
      const permission = await Notification.requestPermission();
      console.log("🔔 Permission result:", permission);

      if (permission === "granted") {
        // Now subscribe to push notifications with FCM
        const success = await subscribe();
        if (success) {
          console.log("✅ Successfully subscribed to notifications");
        }
      } else if (permission === "denied") {
        console.log("❌ Notification permission denied");
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
    }

    setIsSubscribing(false);
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
            stroke={isDenied ? "#f85149" : "currentColor"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            {isDenied && <line x1="1" y1="1" x2="23" y2="23" />}
          </svg>
        </div>
        <div className={styles.notificationBannerText}>
          <strong>
            {isDenied ? "Notifications blocked" : "Enable notifications"}
          </strong>
          <span>
            {isDenied
              ? "Click the 🔒 icon in your browser's address bar to enable"
              : "Get notified instantly when new messages arrive"}
          </span>
        </div>
      </div>
      <div className={styles.notificationBannerActions}>
        <button
          onClick={handleDismiss}
          className={styles.notificationBannerDismiss}
        >
          {isDenied ? "Dismiss" : "Not now"}
        </button>
        {!isDenied && (
          <button
            onClick={handleEnable}
            disabled={isSubscribing}
            className={styles.notificationBannerEnable}
          >
            {isSubscribing ? "Enabling..." : "Enable"}
          </button>
        )}
      </div>
    </div>
  );
}
