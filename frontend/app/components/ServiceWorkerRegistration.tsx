"use client";

import { useEffect } from "react";

/**
 * Service Worker Registration Component
 *
 * Registers the service worker for PWA functionality and push notifications.
 * This component doesn't render anything, it just handles the registration on mount.
 */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      // Register the service worker
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("✅ Service Worker registered:", registration.scope);

          // Check for updates periodically
          registration.update();

          // Handle updates
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (
                  newWorker.state === "installed" &&
                  navigator.serviceWorker.controller
                ) {
                  console.log("🔄 New service worker available");
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error("❌ Service Worker registration failed:", error);
        });
    } else {
      console.log("⚠️ Service Workers not supported in this browser");
    }
  }, []);

  return null; // This component doesn't render anything
}
