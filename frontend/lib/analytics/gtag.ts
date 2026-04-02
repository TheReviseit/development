/**
 * Google Analytics gtag.js Wrapper
 * ==================================
 *
 * Low-level, idempotent wrapper around the gtag.js API.
 *
 * This module handles:
 *   - Dynamic script injection (async, non-blocking)
 *   - Idempotent initialization (never initializes twice)
 *   - Cross-domain linker configuration
 *   - Data Layer integration (all events route through dataLayer)
 *   - Health monitoring integration
 *   - SSR safety (all operations are no-ops on server)
 *
 * This is a PRIVATE module — external code should use lib/analytics/index.ts.
 *
 * @see https://developers.google.com/analytics/devguides/collection/ga4/tag-guide
 */

import type { CrossDomainConfig } from "./config";
import { isDebugMode } from "./config";
import { ensureDataLayer } from "./dataLayer";
import { analyticsHealth } from "./health";

// =============================================================================
// INITIALIZATION STATE
// =============================================================================

/** Global initialization guard — prevents double init */
let _initialized = false;

/** The active measurement ID (set during init) */
let _activeMeasurementId: string | null = null;

/** Timestamp of initialization */
let _initTimestamp: number | null = null;

// =============================================================================
// SCRIPT INJECTION
// =============================================================================

/**
 * Inject the gtag.js script tag into the document head.
 * The script loads asynchronously and non-blocking.
 *
 * @param measurementId - GA4 Measurement ID (e.g., G-E06R01F4TF)
 * @returns Promise that resolves when script loads, rejects on failure
 */
export function injectGtagScript(measurementId: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  // Check if already injected
  const existingScript = document.querySelector(
    `script[src*="googletagmanager.com/gtag/js"]`
  );
  if (existingScript) {
    analyticsHealth.record("script_loaded", { cached: true });
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    script.async = true;
    script.setAttribute("data-analytics-script", "gtag");

    script.onload = () => {
      analyticsHealth.record("script_loaded", { measurementId });

      if (isDebugMode()) {
        console.log(
          "%c[Analytics:gtag] Script loaded successfully",
          "color: #10B981; font-weight: bold;",
          { measurementId }
        );
      }

      resolve();
    };

    script.onerror = () => {
      analyticsHealth.record("script_failed", {
        measurementId,
        reason: "Script load error (possible ad blocker)",
      });
      reject(new Error("gtag.js script failed to load"));
    };

    document.head.appendChild(script);
  });
}

// =============================================================================
// CORE GTAG FUNCTION
// =============================================================================

/**
 * Low-level gtag() call.
 * Routes through window.dataLayer (the standard way).
 *
 * This function is the ONLY place that calls window.gtag.
 * All other modules use the typed wrappers below.
 */
function gtag(...args: unknown[]): void {
  if (typeof window === "undefined") return;

  ensureDataLayer();

  if (typeof window.gtag !== "function") {
    window.gtag = function (...gtagArgs: unknown[]) {
      window.dataLayer.push(gtagArgs as unknown as never);
    };
  }

  window.gtag(...args);
}

/**
 * Set default consent state BEFORE gtag loads.
 * This puts GA4 into "cookieless ping" mode - anonymous pings without cookies.
 * Called before script injection.
 */
function setDefaultConsent(): void {
  gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    wait_for_update: 500,
  });
}

/**
 * Update consent state when user grants/revokes consent.
 * Called when cookie consent changes.
 *
 * @param analytics - Whether analytics storage is granted
 * @param adStorage - Whether ad storage is granted (default: denied)
 */
export function updateConsent(analytics: boolean, adStorage: boolean = false): void {
  if (typeof window === "undefined") return;

  gtag("consent", "update", {
    analytics_storage: analytics ? "granted" : "denied",
    ad_storage: adStorage ? "granted" : "denied",
  });

  analyticsHealth.record(analytics ? "consent_granted" : "consent_revoked");

  if (isDebugMode()) {
    console.log(
      `%c[Analytics:gtag] Consent updated: analytics=${analytics}, ad_storage=${adStorage}`,
      "color: #8B5CF6; font-weight: bold;"
    );
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize Google Analytics with the given measurement ID.
 *
 * IDEMPOTENT: Calling this multiple times is safe — only the first call
 * performs initialization. Subsequent calls are no-ops.
 *
 * @param measurementId - GA4 Measurement ID
 * @param crossDomain - Cross-domain linker configuration
 */
export async function initializeGtag(
  measurementId: string,
  crossDomain: CrossDomainConfig
): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // Idempotent guard
  if (_initialized && _activeMeasurementId === measurementId) {
    if (isDebugMode()) {
      console.log(
        "%c[Analytics:gtag] Already initialized, skipping",
        "color: #6B7280; font-weight: bold;",
        { measurementId }
      );
    }
    return true;
  }

  try {
    // Initialize dataLayer and gtag function first
    ensureDataLayer();

    // Set default consent BEFORE script loads
    // This puts GA4 into "cookieless ping" mode
    setDefaultConsent();

    // Inject the script
    await injectGtagScript(measurementId);

    // Set timestamp first
    gtag("js", new Date());

    // Configure with cross-domain + privacy settings
    gtag("config", measurementId, {
      // Cross-domain tracking
      linker: {
        domains: crossDomain.domains,
        accept_incoming: crossDomain.acceptIncoming,
        decorate_forms: crossDomain.decorateForms,
        url_passthrough: crossDomain.urlPassthrough,
      },
      // Privacy / GDPR
      anonymize_ip: true,
      cookie_flags: "SameSite=None;Secure",
      // Cookie domain — ROOT DOMAIN for cross-subdomain cookie sharing
      // CRITICAL: Must be "flowauxi.com" NOT "shop.flowauxi.com"
      // This ensures _ga cookie is available on ALL subdomains
      cookie_domain: "flowauxi.com",
      // Send page_view on config (standard behavior)
      send_page_view: true,
      // Debug mode
      debug_mode: isDebugMode(),
    });

    // Mark as initialized
    _initialized = true;
    _activeMeasurementId = measurementId;
    _initTimestamp = Date.now();

    analyticsHealth.record("provider_initialized", {
      provider: "google_analytics",
      measurementId,
    });

    if (isDebugMode()) {
      console.log(
        "%c[Analytics:gtag] ✅ Initialized successfully",
        "color: #10B981; font-weight: bold;",
        {
          measurementId,
          crossDomains: crossDomain.domains,
          timestamp: new Date().toISOString(),
        }
      );
    }

    return true;
  } catch (error) {
    analyticsHealth.record("provider_failed", {
      provider: "google_analytics",
      error: error instanceof Error ? error.message : "Unknown error",
    });

    if (isDebugMode()) {
      console.warn(
        "%c[Analytics:gtag] ❌ Initialization failed",
        "color: #EF4444; font-weight: bold;",
        error
      );
    }

    return false;
  }
}

// =============================================================================
// EVENT TRACKING
// =============================================================================

/**
 * Send a GA4 event.
 *
 * @param eventName - Event name (should be a valid AnalyticsEventName)
 * @param params - Event parameters
 * @returns true if event was sent, false if dropped
 */
export function gtagEvent(
  eventName: string,
  params?: Record<string, unknown>
): boolean {
  if (typeof window === "undefined") return false;

  if (!_initialized) {
    analyticsHealth.record("event_dropped", {
      event: eventName,
      reason: "gtag not initialized",
    });
    return false;
  }

  if (typeof window.gtag !== "function") {
    analyticsHealth.record("event_dropped", {
      event: eventName,
      reason: "gtag function not available (ad blocker?)",
    });
    analyticsHealth.record("ad_blocker_detected");
    return false;
  }

  try {
    gtag("event", eventName, params || {});
    analyticsHealth.record("event_sent", { event: eventName });

    if (isDebugMode()) {
      console.log(
        `%c[Analytics:gtag] Event: ${eventName}`,
        "color: #3B82F6; font-weight: bold;",
        params
      );
    }

    return true;
  } catch (error) {
    analyticsHealth.record("event_dropped", {
      event: eventName,
      reason: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}

/**
 * Send a GA4 pageview event.
 *
 * @param url - Page URL/path
 * @param title - Page title
 */
export function gtagPageview(url: string, title?: string): boolean {
  return gtagEvent("page_view", {
    page_path: url,
    page_title: title,
    page_location:
      typeof window !== "undefined" ? window.location.href : undefined,
  });
}

/**
 * Update GA4 config (e.g., set user_id after login).
 *
 * @param measurementId - GA4 Measurement ID
 * @param params - Config parameters to update
 */
export function gtagConfig(
  measurementId: string,
  params: Record<string, unknown>
): void {
  if (typeof window === "undefined" || !_initialized) return;

  gtag("config", measurementId, params);

  if (isDebugMode()) {
    console.log(
      "%c[Analytics:gtag] Config updated",
      "color: #8B5CF6; font-weight: bold;",
      { measurementId, params }
    );
  }
}

/**
 * Set user properties in GA4.
 */
export function gtagSetUser(
  userId: string,
  traits?: Record<string, unknown>
): void {
  if (typeof window === "undefined" || !_initialized) return;

  if (_activeMeasurementId) {
    gtagConfig(_activeMeasurementId, {
      user_id: userId,
      ...traits,
    });
  }

  gtag("set", "user_properties", traits || {});
}

// =============================================================================
// STATE QUERIES
// =============================================================================

/** Check if gtag has been initialized */
export function isGtagInitialized(): boolean {
  return _initialized;
}

/** Get the active measurement ID */
export function getActiveMeasurementId(): string | null {
  return _activeMeasurementId;
}

/** Get initialization timestamp */
export function getInitTimestamp(): number | null {
  return _initTimestamp;
}

// =============================================================================
// WINDOW AUGMENTATION
// =============================================================================

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
  }
}
