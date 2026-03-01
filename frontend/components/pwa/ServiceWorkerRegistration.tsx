"use client";

import { useEffect } from "react";

/**
 * Service Worker Registration — Production-Grade
 *
 * Registers sw.js for PWA + push notifications.
 *
 * ⚠️  IMPORTANT: This component must NEVER call window.location.reload()
 *     on `controllerchange` during initial registration. Doing so causes
 *     a visible page reload on every first visit:
 *
 *     1. User visits site → SW installs → skipWaiting() → activate → clients.claim()
 *     2. clients.claim() fires `controllerchange` in the browser
 *     3. Old code called window.location.reload() here → USER SEES PAGE FLASH
 *
 *     The fix: Only reload on controllerchange if the page already HAD a
 *     controller (i.e., this is an UPDATE, not the initial registration).
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // In development: unregister all SWs to avoid caching issues with HMR
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
          console.log("🛠️ Dev Mode: Unregistered existing service worker.");
        }
      });
      return;
    }

    // ── Track whether page already had a controller BEFORE we register ──
    // This is the key to preventing reload on first visit.
    // On a fresh profile, navigator.serviceWorker.controller is null.
    // After the SW activates and calls clients.claim(), it becomes non-null
    // and fires `controllerchange`. We must NOT reload in that case.
    const hadControllerOnLoad = !!navigator.serviceWorker.controller;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        console.log("✅ SW registered:", registration.scope);

        // Wait for service worker to be ready
        await navigator.serviceWorker.ready;

        // Send Firebase config to the active service worker
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
          }
        };

        // Send config if SW is already controlling
        if (navigator.serviceWorker.controller) {
          sendConfig();
        }

        // Handle SW updates — only prompt if this is a REAL update
        // (user already had an older SW controlling the page)
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // A new SW is waiting. Don't auto-reload — let the user
              // see it on next natural navigation. This prevents the
              // "page loads then reloads" issue entirely.
              console.log(
                "🆕 New SW version available — will activate on next visit.",
              );
            }
          });
        });
      } catch (error) {
        console.error("❌ SW registration failed:", error);
      }
    };

    registerSW();

    // ── Controller Change Handler ──
    // ONLY reload if the page already had a controller.
    // This means we're transitioning from SW v1 → SW v2 (a real update).
    // If hadControllerOnLoad is false, this is the INITIAL registration
    // and we must NOT reload (that's what caused the flash).
    const handleControllerChange = () => {
      if (hadControllerOnLoad) {
        console.log("🔄 SW updated — reloading for new version.");
        window.location.reload();
      } else {
        console.log(
          "✅ SW took control (initial registration) — no reload needed.",
        );
      }
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
    };
  }, []);

  return null;
}
