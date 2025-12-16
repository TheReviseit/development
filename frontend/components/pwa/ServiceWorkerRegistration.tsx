"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Register service worker directly - don't wait for load event
    // (component mounts after page load, so load event would never fire)
    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        console.log("SW registered:", registration.scope);

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
              console.log("New content available, refresh to update");

              // Optional: Show a toast/notification to the user
              if (window.confirm("New version available! Reload to update?")) {
                window.location.reload();
              }
            }
          });
        });
      } catch (error) {
        console.error("SW registration failed:", error);
      }
    };

    registerSW();

    // Cleanup: Listen for controller change (when SW takes over)
    const handleControllerChange = () => {
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
