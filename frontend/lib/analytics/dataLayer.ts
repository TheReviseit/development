/**
 * Data Layer Standardization
 * ============================
 *
 * FAANG-Level Data Layer implementation following Google Tag Manager standards.
 *
 * All analytics events flow through window.dataLayer FIRST before being
 * dispatched to any analytics provider. This decouples the frontend from
 * Google Analytics and enables:
 *
 *   1. GTM migration without code changes
 *   2. Multiple analytics tools consuming the same data layer
 *   3. Standard ecommerce data layer schema
 *   4. Event replay / debugging via dataLayer inspection
 *   5. Server-side GTM container support
 *
 * Architecture:
 *   Component → trackEvent() → pushToDataLayer() → dataLayer.push()
 *                                                 ↓
 *                                          Providers consume
 *                                          (GA4, GTM, Mixpanel)
 *
 * @see https://developers.google.com/tag-manager/devguide
 * @see https://developers.google.com/analytics/devguides/collection/ga4/ecommerce
 */

import type { AnalyticsEvent, AnalyticsEventName } from "./events";
import { ANALYTICS_SCHEMA_VERSION } from "./events";
import { isDebugMode } from "./config";

// =============================================================================
// TYPES
// =============================================================================

/** Standard data layer entry shape */
export interface DataLayerEntry {
  /** The event name (matches GA4 event names) */
  event: string;
  /** Event parameters */
  eventParams?: Record<string, unknown>;
  /** Ecommerce data (for purchase/cart events) */
  ecommerce?: Record<string, unknown>;
  /** Timestamp of the push */
  _timestamp: number;
  /** Schema version for data governance */
  _schemaVersion: string;
  /** Source identifier for debugging */
  _source: "flowauxi-analytics";
}

/** Ecommerce event names that use the ecommerce data layer key */
const ECOMMERCE_EVENTS: Set<AnalyticsEventName> = new Set([
  "purchase",
  "begin_checkout",
  "add_to_cart",
  "remove_from_cart",
  "view_item",
  "view_item_list",
]);

// =============================================================================
// DATA LAYER INITIALIZATION
// =============================================================================

/**
 * Ensure window.dataLayer exists.
 * Safe to call multiple times (idempotent).
 */
export function ensureDataLayer(): void {
  if (typeof window === "undefined") return;

  if (!window.dataLayer) {
    window.dataLayer = [];
  }
}

// =============================================================================
// CORE DATA LAYER PUSH
// =============================================================================

/**
 * Push an analytics event to the data layer.
 *
 * This is the SINGLE ENTRY POINT for all analytics data.
 * All trackEvent() calls route through here.
 *
 * For ecommerce events, the data is structured following
 * the GA4 ecommerce data layer specification:
 *   - Clears previous ecommerce data first (prevents contamination)
 *   - Pushes ecommerce object with items array
 *
 * @param event - Typed analytics event from events.ts
 */
export function pushToDataLayer(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;

  ensureDataLayer();

  const isEcommerceEvent = ECOMMERCE_EVENTS.has(event.name);

  // For ecommerce events: clear previous ecommerce data first
  // This prevents data contamination between sequential ecommerce events
  // @see https://developers.google.com/analytics/devguides/collection/ga4/ecommerce#clear_the_ecommerce_object
  if (isEcommerceEvent) {
    window.dataLayer.push({ ecommerce: null as unknown } as any);
  }

  const entry: DataLayerEntry = {
    event: event.name,
    eventParams: event.params as Record<string, unknown>,
    _timestamp: Date.now(),
    _schemaVersion: ANALYTICS_SCHEMA_VERSION,
    _source: "flowauxi-analytics",
  };

  // Structure ecommerce data in the standard GA4 format
  if (isEcommerceEvent && "items" in event.params) {
    const params = event.params as Record<string, unknown>;
    entry.ecommerce = {
      ...params,
    };
  }

  window.dataLayer.push(entry);

  // Debug logging
  if (isDebugMode()) {
    console.log(
      `%c[Analytics:DataLayer] ${event.name}`,
      "color: #7C3AED; font-weight: bold;",
      {
        params: event.params,
        ecommerce: isEcommerceEvent,
        timestamp: new Date().toISOString(),
      }
    );
  }
}

/**
 * Push a raw entry to the data layer.
 * Used for non-event data (e.g., user properties, consent signals).
 *
 * @param data - Raw data to push
 */
export function pushRawToDataLayer(data: Record<string, unknown>): void {
  if (typeof window === "undefined") return;

  ensureDataLayer();

  window.dataLayer.push({
    ...data,
    _timestamp: Date.now(),
    _source: "flowauxi-analytics",
  } as any);

  if (isDebugMode()) {
    console.log(
      "%c[Analytics:DataLayer] Raw push",
      "color: #6B7280; font-weight: bold;",
      data
    );
  }
}

// =============================================================================
// DATA LAYER UTILITIES
// =============================================================================

/**
 * Get the current data layer contents.
 * Useful for debugging and health monitoring.
 */
export function getDataLayerContents(): unknown[] {
  if (typeof window === "undefined") return [];
  return window.dataLayer || [];
}

/**
 * Get the count of events in the data layer.
 */
export function getDataLayerEventCount(): number {
  if (typeof window === "undefined") return 0;
  return (window.dataLayer || []).filter(
    (entry: DataLayerEntry) => entry && typeof entry === "object" && "event" in entry
  ).length;
}

/**
 * Push user properties to the data layer.
 * Used when user identity is established.
 */
export function pushUserProperties(
  userId: string,
  traits?: Record<string, unknown>
): void {
  pushRawToDataLayer({
    event: "user_properties_set",
    user_id: userId,
    user_properties: traits || {},
  });
}

/**
 * Push consent state to the data layer.
 * Used when consent preferences change.
 */
export function pushConsentState(consent: {
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}): void {
  pushRawToDataLayer({
    event: "consent_update",
    consent_state: {
      analytics_storage: consent.analytics ? "granted" : "denied",
      ad_storage: consent.marketing ? "granted" : "denied",
      functionality_storage: consent.preferences ? "granted" : "denied",
      personalization_storage: consent.preferences ? "granted" : "denied",
      security_storage: "granted", // Always granted (necessary)
    },
  });
}

// =============================================================================
// WINDOW AUGMENTATION
// =============================================================================

declare global {
  interface Window {
    dataLayer: DataLayerEntry[];
  }
}
