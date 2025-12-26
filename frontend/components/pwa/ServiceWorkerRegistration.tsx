"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Register service worker
    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        console.log("✅ SW registered:", registration.scope);

        // Wait for service worker to be ready
        await navigator.serviceWorker.ready;

        // Send Firebase config to service worker
        // This ensures the SW has the config even if it was just installed
        const sendConfig = () => {
          const controller = navigator.serviceWorker.controller;
          if (controller) {
            controller.postMessage({
              type: "FIREBASE_CONFIG",
              config: {
                apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
                authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
                storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
                messagingSenderId:
                  process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
                appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
              },
            });
            console.log("📤 Firebase config sent to service worker");
          }
        };

        // Send config immediately if SW is controlling the page
        if (navigator.serviceWorker.controller) {
          sendConfig();
        }

        // Also send config when SW takes control
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          console.log("🔄 Service worker controller changed");
          sendConfig();
        });

        // Check for updates on page load
        registration.update();

        // Handle updates - notify user when new version available
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New content available, prompt user to refresh
              console.log("🆕 New content available, refresh to update");

              // Optional: Show a toast/notification to the user
              if (window.confirm("New version available! Reload to update?")) {
                window.location.reload();
              }
            }
          });
        });
      } catch (error) {
        console.error("❌ SW registration failed:", error);
      }
    };

    registerSW();

    // Cleanup: Listen for controller change (when SW takes over)
    const handleControllerChange = () => {
      console.log("🔄 Reloading due to controller change");
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange
    );

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
    };
  }, []);

  return null;
}
