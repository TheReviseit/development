"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getMessagingToken,
  onForegroundMessage,
  isMessagingSupported,
} from "@/src/firebase/firebase-messaging";

interface PushNotificationState {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  permissionStatus: NotificationPermission | "unsupported";
}

interface ForegroundMessage {
  title?: string;
  body?: string;
  conversationId?: string;
  senderPhone?: string;
}

/**
 * Hook for managing push notification subscription
 * Handles FCM token generation, subscription to backend, and foreground messages
 */
export function usePushNotification() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    isSubscribed: false,
    isLoading: true,
    error: null,
    permissionStatus: "default",
  });

  const [foregroundMessage, setForegroundMessage] =
    useState<ForegroundMessage | null>(null);
  const unsubscribeForegroundRef = useRef<(() => void) | null>(null);

  // Check support and current status on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkStatus = async () => {
      const supported = isMessagingSupported();
      const permission =
        "Notification" in window ? Notification.permission : "unsupported";

      // Check if we have a stored subscription
      const storedToken = localStorage.getItem("fcm_token");

      setState((prev) => ({
        ...prev,
        isSupported: supported,
        isSubscribed: !!storedToken && permission === "granted",
        permissionStatus: permission as NotificationPermission | "unsupported",
        isLoading: false,
      }));

      // Set up foreground message handler if subscribed
      if (storedToken && permission === "granted") {
        setupForegroundHandler();
      }
    };

    checkStatus();

    return () => {
      if (unsubscribeForegroundRef.current) {
        unsubscribeForegroundRef.current();
      }
    };
  }, []);

  // Set up foreground message handling
  const setupForegroundHandler = useCallback(() => {
    if (unsubscribeForegroundRef.current) {
      unsubscribeForegroundRef.current();
    }

    unsubscribeForegroundRef.current = onForegroundMessage((payload) => {
      console.log("📬 Foreground message received:", payload);

      const notification = payload.notification || {};
      const data = payload.data || {};

      const title = notification.title || data.title || "New Message";
      const body = notification.body || data.body || "You have a new message";

      setForegroundMessage({
        title,
        body,
        conversationId: data.conversationId,
        senderPhone: data.senderPhone,
      });

      // Show browser notification even in foreground
      if ("Notification" in window && Notification.permission === "granted") {
        const notif = new Notification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: data.conversationId || "foreground-message",
          data: {
            url: data.url || "/dashboard",
            conversationId: data.conversationId,
          },
        });

        // Handle notification click
        notif.onclick = () => {
          window.focus();
          if (data.conversationId) {
            window.location.href = `/dashboard?conversation=${data.conversationId}`;
          }
          notif.close();
        };
      }

      // Auto-clear state after 5 seconds
      setTimeout(() => setForegroundMessage(null), 5000);
    });
  }, []);

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) {
      setState((prev) => ({
        ...prev,
        error: "Push notifications are not supported in this browser",
      }));
      return false;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Get FCM token (this also requests permission)
      const token = await getMessagingToken();

      if (!token) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Failed to get notification token. Permission may be denied.",
          permissionStatus: Notification.permission,
        }));
        return false;
      }

      // Send token to backend
      const response = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          deviceInfo: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
          },
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to subscribe");
      }

      // Store token locally
      localStorage.setItem("fcm_token", token);

      // Set up foreground handler
      setupForegroundHandler();

      setState((prev) => ({
        ...prev,
        isSubscribed: true,
        isLoading: false,
        permissionStatus: "granted",
      }));

      console.log("✅ Successfully subscribed to push notifications");
      return true;
    } catch (error) {
      console.error("Failed to subscribe to push notifications:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to subscribe",
      }));
      return false;
    }
  }, [state.isSupported, setupForegroundHandler]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const token = localStorage.getItem("fcm_token");

      if (token) {
        // Remove from backend
        await fetch("/api/notifications/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
      }

      // Clear local storage
      localStorage.removeItem("fcm_token");

      // Clear foreground handler
      if (unsubscribeForegroundRef.current) {
        unsubscribeForegroundRef.current();
        unsubscribeForegroundRef.current = null;
      }

      setState((prev) => ({
        ...prev,
        isSubscribed: false,
        isLoading: false,
      }));

      console.log("✅ Successfully unsubscribed from push notifications");
      return true;
    } catch (error) {
      console.error("Failed to unsubscribe:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to unsubscribe",
      }));
      return false;
    }
  }, []);

  // Clear foreground message
  const clearForegroundMessage = useCallback(() => {
    setForegroundMessage(null);
  }, []);

  return {
    ...state,
    subscribe,
    unsubscribe,
    foregroundMessage,
    clearForegroundMessage,
  };
}
