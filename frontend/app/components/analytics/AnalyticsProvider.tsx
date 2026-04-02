"use client";

/**
 * Analytics Provider — React Client Component
 * =============================================
 *
 * FAANG-level consent-aware analytics initialization and pageview tracking.
 *
 * This component:
 *   1. Initializes analytics IMMEDIATELY (not waiting for consent)
 *   2. Sets default consent to 'denied' (cookieless ping mode)
 *   3. Listens for consent changes and updates gtag consent state
 *   4. Manages client ID lifecycle (_fa_client_id)
 *   5. Handles fallback queue for ad-blocker bypass
 *   6. Automatically tracks pageviews on route changes
 *   7. On consent REVOKE: clears queue, resets client ID, stops tracking
 *
 * Mount this component ONCE in the root layout.
 *
 * @see lib/analytics/index.ts for the analytics API
 * @see lib/utils/cookieConsent.ts for the consent system
 */

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  initAnalytics,
  trackPageview,
  handleConsentChange,
  isAnalyticsInitialized,
} from "@/lib/analytics";
import { getConsentPreferences } from "@/lib/utils/cookieConsent";
import { updateConsent as gtagUpdateConsent } from "@/lib/analytics/gtag";
import {
  initializeClientId,
  incrementConsentVersion,
  resetClientId,
  getClientId,
} from "@/lib/analytics/clientId";
import {
  initializeFallbackQueue,
  drainQueue,
  clearQueue,
} from "@/lib/analytics/fallbackQueue";
import { analyticsHealth } from "@/lib/analytics/health";

/**
 * AnalyticsProvider — mount in root layout.
 *
 * No UI output. This is a pure side-effect component.
 *
 * <body>
 *   <AnalyticsProvider />
 *   {children}
 * </body>
 */
export function AnalyticsProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initializedRef = useRef(false);
  const consentGrantedRef = useRef(false);
  const previousPathRef = useRef<string | null>(null);

  useEffect(() => {
    async function initialize() {
      if (initializedRef.current) return;

      initializeFallbackQueue();

      const hostname = window.location.hostname;
      const port = window.location.port;
      const fullHost = port ? `${hostname}:${port}` : hostname;

      const success = await initAnalytics(fullHost);
      if (success) {
        initializedRef.current = true;

        const preferences = getConsentPreferences();
        if (preferences?.analytics) {
          consentGrantedRef.current = true;
          initializeClientId();
          incrementConsentVersion();

          gtagUpdateConsent(true, preferences.marketing);

          handleConsentChange({
            analytics: preferences.analytics,
            marketing: preferences.marketing,
            preferences: preferences.preferences,
          });

          drainQueue();
        }
      }
    }

    initialize();
  }, []);

  useEffect(() => {
    function onConsentChanged(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (!detail?.preferences) return;

      const { analytics, marketing, preferences } = detail.preferences;

      handleConsentChange({ analytics, marketing, preferences });

      if (analytics && !consentGrantedRef.current) {
        consentGrantedRef.current = true;
        initializeClientId();
        incrementConsentVersion();
        gtagUpdateConsent(true, marketing);
        drainQueue();

        if (isDebugMode()) {
          console.log(
            "%c[Analytics:Provider] Consent granted, queue draining",
            "color: #10B981;"
          );
        }
      } else if (!analytics && consentGrantedRef.current) {
        consentGrantedRef.current = false;
        gtagUpdateConsent(false, false);
        clearQueue();
        resetClientId();

        analyticsHealth.record("consent_revoked");

        if (isDebugMode()) {
          console.log(
            "%c[Analytics:Provider] Consent revoked, queue cleared",
            "color: #EF4444;"
          );
        }
      }
    }

    window.addEventListener("cookieConsentChanged", onConsentChanged);

    return () => {
      window.removeEventListener("cookieConsentChanged", onConsentChanged);
    };
  }, []);

  useEffect(() => {
    if (!initializedRef.current || !consentGrantedRef.current) return;

    const search = searchParams?.toString();
    const url = search ? `${pathname}?${search}` : pathname;

    if (previousPathRef.current === null) {
      previousPathRef.current = url;
      return;
    }

    if (previousPathRef.current !== url) {
      trackPageview(url, document.title);
      previousPathRef.current = url;
    }
  }, [pathname, searchParams]);

  return null;
}

function isDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  return process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "true";
}

export default AnalyticsProvider;
