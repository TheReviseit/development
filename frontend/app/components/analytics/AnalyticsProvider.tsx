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
 *   6. Automatically tracks pageviews on route changes (ALWAYS - cookieless works!)
 *   7. On consent REVOKE: clears queue, resets client ID, stops tracking
 *
 * CRITICAL: Pageview tracking works REGARDLESS of consent state.
 * When consent is denied, GA4 sends "cookieless pings" - anonymous events
 * without cookies or client_id persistence. This ensures we track users
 * even before they accept/reject cookies.
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

        // Check if consent was already restored by GtagScript
        const restoredConsent = (window as Window & { __fa_consent_restored?: { analytics: boolean; marketing: boolean; preferences: boolean } }).__fa_consent_restored;
        
        // Also check cookie consent preferences
        const preferences = getConsentPreferences();
        
        // Use either restored consent from localStorage OR cookie preferences
        const hasAnalyticsConsent = restoredConsent?.analytics || preferences?.analytics;
        
        if (hasAnalyticsConsent) {
          consentGrantedRef.current = true;
          initializeClientId();
          incrementConsentVersion();

          const marketingConsent = restoredConsent?.marketing || preferences?.marketing;
          gtagUpdateConsent(true, marketingConsent);

          handleConsentChange({
            analytics: true,
            marketing: marketingConsent || false,
            preferences: restoredConsent?.preferences || preferences?.preferences || false,
          });

          drainQueue();

          if (isDebugMode()) {
            console.log(
              "%c[Analytics:Provider] Consent active, queue draining",
              "color: #10B981;"
            );
          }
        } else {
          // Still initialize but without full consent - cookieless mode will work
          if (isDebugMode()) {
            console.log(
              "%c[Analytics:Provider] Cookieless mode (no consent yet)",
              "color: #F59E0B;"
            );
          }
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
    // Track pageviews REGARDLESS of consent state
    // This ensures cookieless pings work from the start
    // GA4 sends anonymous pings when consent is denied
    if (!initializedRef.current) return;

    const search = searchParams?.toString();
    const url = search ? `${pathname}?${search}` : pathname;

    if (previousPathRef.current === null) {
      // First pageview - track immediately on mount
      previousPathRef.current = url;
      trackPageview(url, document.title);
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
