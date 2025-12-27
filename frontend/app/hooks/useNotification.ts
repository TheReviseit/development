"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}

export function useNotification() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<
    NotificationPermission | "unsupported"
  >("default");

  // Initialize audio element and check permission status
  useEffect(() => {
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("/sounds/notification.mp3");
      audioRef.current.volume = 0.5;

      if ("Notification" in window) {
        setPermissionStatus(Notification.permission);
      } else {
        setPermissionStatus("unsupported");
      }
    }
  }, []);

  // Request notification permission (must be called from user interaction like button click)
  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      console.log("Browser does not support notifications");
      setPermissionStatus("unsupported");
      return false;
    }

    if (Notification.permission === "granted") {
      setPermissionStatus("granted");
      return true;
    }

    if (Notification.permission !== "denied") {
      try {
        const permission = await Notification.requestPermission();
        setPermissionStatus(permission);
        return permission === "granted";
      } catch (err) {
        console.error("Error requesting notification permission:", err);
        return false;
      }
    }

    setPermissionStatus("denied");
    return false;
  }, []);

  // Check if permission is granted
  const hasPermission = useCallback(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }
    return Notification.permission === "granted";
  }, []);

  // Play notification sound
  const playSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch((err) => {
        console.log("Could not play notification sound:", err);
      });
    }
  }, []);

  // Show notification
  const showNotification = useCallback(
    ({ title, body, icon, tag, onClick }: NotificationOptions) => {
      console.log("🔔 showNotification called with:", { title, body, tag });
      console.log(
        "🔔 Notification.permission:",
        typeof window !== "undefined" ? Notification.permission : "N/A"
      );

      if (!hasPermission()) {
        console.log("❌ Notification permission not granted");
        return;
      }

      // Play sound (will fail gracefully if no sound file)
      playSound();

      try {
        // Show browser notification
        console.log("🔔 Creating Notification object...");
        const notification = new Notification(title, {
          body: body.length > 100 ? body.substring(0, 100) + "..." : body,
          icon: icon || "/logo.svg",
          tag: tag, // Prevents duplicate notifications for same conversation
          badge: "/logo.svg",
          silent: false, // Allow browser to show notification visibly
        });

        console.log("✅ Notification created successfully:", notification);

        notification.onclick = () => {
          console.log("🔔 Notification clicked!");
          window.focus();
          notification.close();
          if (onClick) onClick();
        };

        notification.onshow = () => {
          console.log("✅ Notification shown!");
        };

        notification.onerror = (e) => {
          console.error("❌ Notification error:", e);
        };

        // Auto close after 5 seconds
        setTimeout(() => notification.close(), 5000);
      } catch (error) {
        console.error("❌ Error creating notification:", error);
      }
    },
    [hasPermission, playSound]
  );

  return {
    requestPermission,
    hasPermission,
    showNotification,
    playSound,
    permissionStatus,
  };
}
