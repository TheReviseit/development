"use client";

import {
  getMessaging,
  getToken,
  onMessage,
  Messaging,
} from "firebase/messaging";
import { initializeApp, getApps, FirebaseApp } from "firebase/app";

// Firebase config (reuse from main config)
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// VAPID key from Firebase Console -> Project Settings -> Cloud Messaging -> Web Push certificates
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

let messagingInstance: Messaging | null = null;
let app: FirebaseApp | null = null;

/**
 * Check if Firebase Messaging is supported in the current browser
 */
export function isMessagingSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Get or initialize Firebase Messaging instance
 */
function getMessagingInstance(): Messaging | null {
  if (typeof window === "undefined") return null;

  if (!isMessagingSupported()) {
    console.warn("Firebase Messaging is not supported in this browser");
    return null;
  }

  if (!messagingInstance) {
    try {
      // Initialize Firebase app if not already initialized
      if (!getApps().length) {
        app = initializeApp(firebaseConfig);
      } else {
        app = getApps()[0];
      }
      messagingInstance = getMessaging(app);
    } catch (error) {
      console.error("Failed to initialize Firebase Messaging:", error);
      return null;
    }
  }

  return messagingInstance;
}

/**
 * Request permission and get FCM token for push notifications
 * @returns FCM token string or null if failed/denied
 */
export async function getMessagingToken(): Promise<string | null> {
  const messaging = getMessagingInstance();
  if (!messaging) return null;

  if (!VAPID_KEY) {
    console.error(
      "❌ VAPID key not configured. Set NEXT_PUBLIC_FIREBASE_VAPID_KEY in .env"
    );
    return null;
  }

  try {
    // Check if service worker is registered and ready
    if (!navigator.serviceWorker.controller) {
      console.warn("⚠️ Service worker not controlling page yet, waiting...");
      // Wait for service worker to take control
      await new Promise<void>((resolve) => {
        const checkController = () => {
          if (navigator.serviceWorker.controller) {
            resolve();
          } else {
            setTimeout(checkController, 100);
          }
        };
        checkController();
        // Timeout after 5 seconds
        setTimeout(() => resolve(), 5000);
      });
    }

    // Request notification permission
    console.log("📢 Requesting notification permission...");
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      console.log("❌ Notification permission denied");
      return null;
    }

    console.log("✅ Notification permission granted");

    // Wait for service worker to be ready and active
    const registration = await navigator.serviceWorker.ready;
    if (!registration) {
      console.error("❌ Service worker not ready");
      return null;
    }

    // Ensure service worker is active
    if (!registration.active) {
      console.error("❌ Service worker not active");
      return null;
    }

    console.log("✅ Service worker ready and active");

    // Wait a bit for service worker to fully initialize Firebase
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get FCM token with retry logic
    console.log("🔑 Getting FCM token...");
    const token = await getTokenWithRetry(messaging, registration);

    if (token) {
      console.log("✅ FCM Token obtained:", token.substring(0, 20) + "...");
      return token;
    } else {
      console.log("❌ No FCM token available");
      return null;
    }
  } catch (error) {
    console.error("❌ Error getting FCM token:", error);
    return null;
  }
}

/**
 * Get FCM token with retry logic for transient network failures
 */
async function getTokenWithRetry(
  messaging: Messaging,
  registration: ServiceWorkerRegistration,
  maxRetries = 3
): Promise<string | null> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      });

      if (token) {
        return token;
      }
    } catch (error) {
      lastError = error as Error;
      console.warn(`FCM token attempt ${attempt}/${maxRetries} failed:`, error);

      // Don't retry on permission errors or invalid config
      if (
        error instanceof Error &&
        (error.message.includes("permission") ||
          error.message.includes("invalid") ||
          error.message.includes("VAPID"))
      ) {
        throw error;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  if (lastError) {
    throw lastError;
  }

  return null;
}

/**
 * Listen for foreground messages (when app is open and focused)
 * @param callback - Function to call when a message is received
 * @returns Unsubscribe function
 */
export function onForegroundMessage(
  callback: (payload: {
    notification?: { title?: string; body?: string };
    data?: Record<string, string>;
  }) => void
): () => void {
  const messaging = getMessagingInstance();
  if (!messaging) return () => {};

  return onMessage(messaging, (payload) => {
    console.log("Foreground message received:", payload);
    callback(payload);
  });
}
