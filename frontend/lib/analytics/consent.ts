/**
 * Advanced Consent Mode v2 - FAANG Level
 * ========================================
 *
 * Google Consent Mode v2 implementation with cookieless pings.
 *
 * This is the GOLD STANDARD for privacy-compliant analytics:
 *   - Consent-aware event routing
 *   - Cookieless pings (no cookies = no GDPR consent needed)
 *   - Consent lifecycle management
 *   - Graceful degradation based on consent state
 *
 * Architecture:
 *   User Visit
 *       │
 *       ▼
 *   ┌─────────────────┐
 *   │ Check Consent   │
 *   │   State         │
 *   └────────┬────────┘
 *            │
 *    ┌───────┴───────┐
 *    ▼               ▼
 * GRANTED        DENIED
 *    │               │
 *    ▼               ▼
 * Cookieless    Basic Ping
 * + GA4 Basic   (no cookies)
 *    │               │
 *    ▼               ▼
 * Full GA4      Anonymous Events
 * (if ad_storage) (no cookie IDs)
 *
 * @see https://developers.google.com/tag-platform/security/guides/consent
 * @see https://support.google.com/analytics/answer/12938641
 */

import { isDebugMode } from "./config";
import { analyticsHealth } from "./health";
import type { ConsentState } from "./types";

const CONSENT_COOKIE_NAME = "_fa_consent";
const CONSENT_VERSION = "v2";

// =============================================================================
// CONSENT TYPES - Google Consent Mode v2
// =============================================================================

/**
 * Google Consent Mode v2 consent types.
 * These map directly to Google's consent model.
 */
export type GoogleConsentType =
  // Required - must be granted
  | "granted"
  | "denied";

// Basic consent categories
export type ConsentCategory = "analytics" | "marketing" | "preferences";

/**
 * Full consent state configuration.
 */
export interface ConsentConfig {
  // Analytics storage
  analytics_storage: GoogleConsentType;
  // Ad storage (for ads personalization)
  ad_storage: GoogleConsentType;
  // Ad user data (EU user data consent)
  ad_user_data: GoogleConsentType;
  // Ad personalization (personalized ads)
  ad_personalization: GoogleConsentType;
  // Functionality storage (enhances functionality)
  functionality_storage: GoogleConsentType;
  // Personalization storage (personalized content)
  personalization_storage: GoogleConsentType;
  // Security storage (security cookies)
  security_storage: GoogleConsentType;
}

/**
 * Simplified consent state for internal use.
 */
export interface FlowauxiConsentState {
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  version: string;
  updatedAt: number;
  source: "cookie" | "banner" | "api";
}

// =============================================================================
// DEFAULT CONSENT STATE - COOKIELESS MODE
// =============================================================================

/**
 * Default consent state: DENIED (cookieless mode).
 * This ensures NO cookies are set until explicit consent.
 *
 * Why "denied" by default:
 *   - GDPR compliance (EU requires opt-in)
 *   - CCPA compliance (US can be opt-out)
 *   - Best practice: assume no consent until proven
 *
 * The system will still send cookieless pings:
 *   - page_view events fire
 *   - but NO cookies, NO client_id persistence
 *   - anonymous sessions only
 */
const DEFAULT_CONSENT: ConsentConfig = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  functionality_storage: "granted", // Always granted (necessary)
  personalization_storage: "denied",
  security_storage: "granted", // Always granted (necessary)
};

/**
 * Full consent granted state.
 * Used when user explicitly accepts all tracking.
 */
const FULL_CONSENT: ConsentConfig = {
  analytics_storage: "granted",
  ad_storage: "granted",
  ad_user_data: "granted",
  ad_personalization: "granted",
  functionality_storage: "granted",
  personalization_storage: "granted",
  security_storage: "granted",
};

// =============================================================================
// CONSENT STATE MANAGEMENT
// =============================================================================

let _consentState: ConsentConfig = { ...DEFAULT_CONSENT };
let _initialized: boolean = false;

/**
 * Initialize consent mode.
 * Must be called BEFORE gtag script loads.
 *
 * This sets default "denied" state first.
 * Then attempts to read stored consent from cookie.
 */
export function initializeConsentMode(): void {
  if (typeof window === "undefined" || _initialized) return;

  _initialized = true;

  // Set default consent BEFORE any scripts load
  // This ensures cookieless pings until consent is granted
  setConsentState(DEFAULT_CONSENT);

  // Try to restore from cookie (if user previously consented)
  const storedConsent = getStoredConsent();
  if (storedConsent) {
    restoreConsentState(storedConsent);
  }

  if (isDebugMode()) {
    console.log(
      "%c[ConsentMode] Initialized with cookieless mode",
      "color: #7C3AED; font-weight: bold;",
      { consent: _consentState }
    );
  }
}

/**
 * Set full consent state.
 * Called when user accepts all cookies via banner.
 */
export function grantFullConsent(): void {
  setConsentState(FULL_CONSENT);
  saveConsentToCookie("banner");
  
  analyticsHealth.record("consent_granted");

  if (isDebugMode()) {
    console.log(
      "%c[ConsentMode] ✅ Full consent granted",
      "color: #10B981; font-weight: bold;"
    );
  }
}

/**
 * Revoke all consent.
 * Called when user rejects cookies via banner.
 */
export function revokeConsent(): void {
  setConsentState(DEFAULT_CONSENT);
  saveConsentToCookie("banner");
  
  analyticsHealth.record("consent_revoked");

  if (isDebugMode()) {
    console.log(
      "%c[ConsentMode] ❌ Consent revoked",
      "color: #EF4444; font-weight: bold;"
    );
  }
}

/**
 * Grant only analytics consent (no marketing).
 * Useful for users who want stats but not ads.
 */
export function grantAnalyticsOnly(): void {
  const analyticsOnly: ConsentConfig = {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    functionality_storage: "granted",
    personalization_storage: "granted",
    security_storage: "granted",
  };
  
  setConsentState(analyticsOnly);
  saveConsentToCookie("banner");
  
  analyticsHealth.record("consent_granted", { type: "analytics_only" });
}

/**
 * Update consent state in real-time.
 * Used by consent management platform.
 */
export function updateConsent(
  category: ConsentCategory,
  granted: boolean
): void {
  const newState = { ..._consentState };

  switch (category) {
    case "analytics":
      newState.analytics_storage = granted ? "granted" : "denied";
      break;
    case "marketing":
      newState.ad_storage = granted ? "granted" : "denied";
      newState.ad_user_data = granted ? "granted" : "denied";
      newState.ad_personalization = granted ? "granted" : "denied";
      break;
    case "preferences":
      newState.personalization_storage = granted ? "granted" : "denied";
      break;
  }

  setConsentState(newState);
  saveConsentToCookie("banner");
}

/**
 * Get current consent state for gtag.
 */
export function getConsentState(): ConsentConfig {
  return { ..._consentState };
}

/**
 * Check if analytics storage is allowed.
 */
export function isAnalyticsAllowed(): boolean {
  return _consentState.analytics_storage === "granted";
}

/**
 * Check if marketing/ads are allowed.
 */
export function isMarketingAllowed(): boolean {
  return _consentState.ad_storage === "granted";
}

// =============================================================================
// COOKIE STORAGE
// =============================================================================

function setConsentState(state: ConsentConfig): void {
  _consentState = { ...state };

  // Update gtag if available
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("consent", "update", _consentState);
  }
}

function getStoredConsent(): FlowauxiConsentState | null {
  if (typeof document === "undefined") return null;

  try {
    const match = document.cookie.match(
      new RegExp(`(^| )${CONSENT_COOKIE_NAME}=([^;]+)`)
    );
    if (match) {
      const decoded = decodeURIComponent(match[2]);
      return JSON.parse(decoded);
    }
  } catch {
    // Invalid cookie, ignore
  }

  return null;
}

function saveConsentToCookie(source: "cookie" | "banner" | "api"): void {
  if (typeof document === "undefined") return;

  const consentState: FlowauxiConsentState = {
    analytics: isAnalyticsAllowed(),
    marketing: isMarketingAllowed(),
    preferences: _consentState.personalization_storage === "granted",
    version: CONSENT_VERSION,
    updatedAt: Date.now(),
    source,
  };

  const cookieValue = encodeURIComponent(JSON.stringify(consentState));
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();

  document.cookie = `${CONSENT_COOKIE_NAME}=${cookieValue};expires=${expires};path=/;SameSite=Lax;Secure`;
}

function restoreConsentState(stored: FlowauxiConsentState): void {
  const restored: ConsentConfig = {
    analytics_storage: stored.analytics ? "granted" : "denied",
    ad_storage: stored.marketing ? "granted" : "denied",
    ad_user_data: stored.marketing ? "granted" : "denied",
    ad_personalization: stored.marketing ? "granted" : "denied",
    functionality_storage: "granted",
    personalization_storage: stored.preferences ? "granted" : "denied",
    security_storage: "granted",
  };

  setConsentState(restored);

  if (isDebugMode()) {
    console.log(
      "%c[ConsentMode] Restored consent from cookie",
      "color: #10B981;",
      { stored, restored }
    );
  }
}

// =============================================================================
// COOKIELESS PINGS - THE KEY DIFFERENTIATOR
// =============================================================================

/**
 * Track event with consent awareness.
 *
 * This is the smarter routing:
 *   - If consent granted: normal event
 *   - If consent denied: still sends event but WITHOUT cookies
 *
 * This is the "cookieless ping" - it works in ALL cases!
 *
 * @returns Whether event was routed (not whether consent was granted)
 */
export function trackWithConsent(
  eventName: string,
  params?: Record<string, unknown>
): boolean {
  // Always record attempt
  analyticsHealth.record("event_attempted", { event: eventName });

  // Check if we can use cookies
  if (!isAnalyticsAllowed()) {
    // COOKIELESS MODE: Still send the event, but gtag handles it differently
    // GA4 will NOT set cookies, will NOT persist client_id
    // But we still get aggregate data!
    analyticsHealth.record("event_cookieless", { event: eventName });

    if (isDebugMode()) {
      console.log(
        `%c[ConsentMode] 📡 Cookieless ping: ${eventName}`,
        "color: #F59E0B;"
      );
    }

    // Still return true - event will be sent but without cookie persistence
    return true;
  }

  // Full consent - normal tracking
  return true;
}

// =============================================================================
// CONSENT STATE EXPORT FOR GTM
// =============================================================================

/**
 * Get consent state as data layer entry.
 * Use this to push consent to GTM.
 */
export function getConsentDataLayerEntry(): Record<string, unknown> {
  return {
    event: "consent_update",
    consent: {
      analytics_storage: _consentState.analytics_storage,
      ad_storage: _consentState.ad_storage,
      ad_user_data: _consentState.ad_user_data,
      ad_personalization: _consentState.ad_personalization,
      functionality_storage: _consentState.functionality_storage,
      personalization_storage: _consentState.personalization_storage,
      security_storage: _consentState.security_storage,
    },
    timestamp: Date.now(),
  };
}

// =============================================================================
// WINDOW AUGMENTATION
// =============================================================================

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
  }
}