/**
 * Analytics Public API
 * =====================
 *
 * THIS IS THE ONLY FILE EXTERNAL CODE SHOULD IMPORT FROM.
 *
 * Provides a clean, typed, consent-aware analytics API:
 *
 *   import { trackEvent, trackPageview, initAnalytics } from '@/lib/analytics';
 *
 *   // Track a typed event
 *   trackEvent({ name: 'purchase', params: { ... } });
 *
 *   // Track a pageview
 *   trackPageview('/dashboard', 'Dashboard');
 *
 *   // Initialize (called by AnalyticsProvider component)
 *   await initAnalytics('shop.flowauxi.com');
 *
 * Architecture:
 *   External code → index.ts → ProviderRegistry → [GA4, Mixpanel, ...]
 *                            → DataLayer
 *                            → HealthMonitor
 *
 * @see events.ts for the event type definitions
 * @see provider.ts for the provider abstraction
 * @see server.ts for server-side tracking
 */

import { getAnalyticsConfig } from "./config";
import type { AnalyticsResolvedConfig } from "./config";
import type { AnalyticsEvent, AnalyticsEventName, EventParams, UserTraits } from "./events";
import { isValidEventName, DEPRECATED_EVENT_MAP } from "./events";
import { pushToDataLayer, pushConsentState } from "./dataLayer";
import { analyticsHealth, getAnalyticsHealth } from "./health";
import type { HealthMetrics } from "./health";
import {
  GoogleAnalyticsProvider,
  AnalyticsProviderRegistry,
} from "./provider";
import { isDebugMode } from "./config";

// =============================================================================
// SINGLETON STATE
// =============================================================================

/** Global provider registry */
const registry = new AnalyticsProviderRegistry();

/** Whether analytics has been initialized */
let _analyticsInitialized = false;

/** The resolved config (set during init) */
let _resolvedConfig: AnalyticsResolvedConfig | null = null;

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize the analytics system.
 *
 * This is called by the AnalyticsProvider React component
 * when analytics consent is granted.
 *
 * IDEMPOTENT: Safe to call multiple times.
 *
 * @param hostname - Current hostname (e.g., 'shop.flowauxi.com')
 */
export async function initAnalytics(hostname: string): Promise<boolean> {
  // Prevent double initialization
  if (_analyticsInitialized) {
    if (isDebugMode()) {
      console.log(
        "%c[Analytics] Already initialized, skipping",
        "color: #6B7280;"
      );
    }
    return true;
  }

  // Resolve config
  const config = getAnalyticsConfig(hostname);
  _resolvedConfig = config;

  if (!config.enabled) {
    if (config.debug) {
      console.log(
        "%c[Analytics] Disabled for current environment",
        "color: #F59E0B; font-weight: bold;",
        { environment: config.environment, hostname }
      );
    }
    return false;
  }

  // Register providers
  registry.register(new GoogleAnalyticsProvider());

  // Future providers:
  // registry.register(new MixpanelProvider());
  // registry.register(new SegmentProvider());

  // Initialize all providers
  await registry.initializeAll(config);

  _analyticsInitialized = true;

  if (config.debug) {
    console.log(
      "%c[Analytics] ✅ System initialized",
      "color: #10B981; font-weight: bold;",
      {
        hostname,
        measurementId: config.domainConfig.measurementId,
        domain: config.domainConfig.domain,
        stream: config.domainConfig.streamName,
        providers: registry.getProviderNames(),
        version: config.version,
      }
    );
  }

  return true;
}

// =============================================================================
// EVENT TRACKING — TYPED API
// =============================================================================

/**
 * Track a typed analytics event.
 *
 * This is the PRIMARY event tracking function.
 * Events must conform to the AnalyticsEvent schema.
 *
 * @example
 * trackEvent({
 *   name: 'purchase',
 *   params: {
 *     transaction_id: 'T123',
 *     value: 29.99,
 *     currency: 'INR',
 *     items: [{ item_id: 'pro', item_name: 'Pro Plan' }]
 *   }
 * });
 */
export function trackEvent(event: AnalyticsEvent): void {
  // Push to data layer regardless of provider state
  // (GTM can still consume from dataLayer)
  pushToDataLayer(event);

  // Check if any provider is ready
  if (!_analyticsInitialized || !registry.hasInitializedProvider()) {
    analyticsHealth.record("event_dropped", {
      event: event.name,
      reason: "no initialized provider",
    });
    return;
  }

  // Dispatch to all providers
  registry.trackEvent(event);
}

/**
 * Track an event by name with typed params.
 *
 * Type-safe version that enforces correct params for each event name.
 *
 * @example
 * trackTypedEvent('signup', { method: 'google' });
 * trackTypedEvent('purchase', { transaction_id: '...', value: 29.99, currency: 'INR', items: [] });
 */
export function trackTypedEvent<T extends AnalyticsEventName>(
  name: T,
  params: EventParams<T>
): void {
  trackEvent({ name, params } as AnalyticsEvent);
}

/**
 * Track an untyped event (backward compatibility).
 *
 * ⚠️ DEPRECATED: Use trackEvent() with typed events instead.
 * This function handles legacy event names via DEPRECATED_EVENT_MAP.
 *
 * @param eventName - Event name string
 * @param params - Event parameters (untyped)
 */
export function trackUntypedEvent(
  eventName: string,
  params?: Record<string, unknown>
): void {
  // Check for deprecated event names
  const mappedName = DEPRECATED_EVENT_MAP[eventName] || eventName;

  if (mappedName !== eventName && isDebugMode()) {
    console.warn(
      `%c[Analytics] Deprecated event "${eventName}" mapped to "${mappedName}". Please update your code.`,
      "color: #F59E0B;"
    );
  }

  // Validate event name
  if (!isValidEventName(mappedName)) {
    if (isDebugMode()) {
      console.warn(
        `%c[Analytics] Unknown event name: "${mappedName}". Using custom_event wrapper.`,
        "color: #F59E0B;"
      );
    }

    // Wrap in custom_event
    trackEvent({
      name: "custom_event",
      params: {
        event_category: "untyped",
        event_label: mappedName,
        ...(params || {}),
      },
    } as AnalyticsEvent);
    return;
  }

  // Dispatch as typed event
  trackEvent({
    name: mappedName,
    params: params || {},
  } as AnalyticsEvent);
}

// =============================================================================
// PAGEVIEW TRACKING
// =============================================================================

/**
 * Track a pageview.
 *
 * Called automatically by the AnalyticsProvider component on route changes.
 * Can also be called manually for virtual pageviews.
 */
export function trackPageview(url: string, title?: string): void {
  if (!_analyticsInitialized || !registry.hasInitializedProvider()) {
    analyticsHealth.record("event_dropped", {
      event: "page_view",
      reason: "no initialized provider",
    });
    return;
  }

  registry.trackPageview(url, title);
}

// =============================================================================
// USER IDENTITY
// =============================================================================

/**
 * Set user identity across all analytics providers.
 * Call this after user login/signup.
 */
export function setAnalyticsUser(
  userId: string,
  traits?: UserTraits
): void {
  if (!_analyticsInitialized) return;

  registry.setUser(userId, traits);

  if (isDebugMode()) {
    console.log(
      "%c[Analytics] User identity set",
      "color: #8B5CF6; font-weight: bold;",
      { userId, traits }
    );
  }
}

// =============================================================================
// CONSENT MANAGEMENT
// =============================================================================

/**
 * Handle consent state change.
 * Called by the AnalyticsProvider when cookie consent changes.
 */
export function handleConsentChange(consent: {
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
}): void {
  // Push consent state to data layer
  pushConsentState(consent);

  if (consent.analytics) {
    analyticsHealth.record("consent_granted");
  } else {
    analyticsHealth.record("consent_denied");
  }
}

// =============================================================================
// HEALTH & DEBUGGING
// =============================================================================

/**
 * Get the current analytics health report.
 */
export { getAnalyticsHealth };
export type { HealthMetrics };

/**
 * Check if analytics is initialized.
 */
export function isAnalyticsInitialized(): boolean {
  return _analyticsInitialized;
}

/**
 * Get the resolved analytics config.
 */
export function getResolvedConfig(): AnalyticsResolvedConfig | null {
  return _resolvedConfig;
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

// Types
export type {
  AnalyticsEvent,
  AnalyticsEventName,
  EventParams,
  UserTraits,
  EcommerceItem,
} from "./events";
export type {
  AnalyticsResolvedConfig,
  DomainAnalyticsConfig,
  CrossDomainConfig,
} from "./config";

// Config utilities
export { getAnalyticsConfig, resolveDomainConfig, isAnalyticsEnabled } from "./config";

// Server-side tracking
export {
  trackServerEvent,
  trackServerPurchase,
  trackServerSignup,
  extractClientIdFromCookie,
  generateServerClientId,
} from "./server";

// Schema
export { ANALYTICS_SCHEMA_VERSION, isValidEventName } from "./events";

// Health
export { analyticsHealth } from "./health";

// Client ID Management
export {
  initializeClientId,
  getClientId,
  getConsentVersion,
  incrementConsentVersion,
  resetClientId,
  isClientIdInitialized,
} from "./clientId";

// Fallback Queue
export {
  initializeFallbackQueue,
  enqueueEvent,
  getQueueSize,
  hasQueuedEvents,
  clearQueue,
  drainQueue,
} from "./fallbackQueue";

// Validation & Debugging
export {
  validateAnalytics,
  checkCrossDomain,
  getDebugReport,
  printValidation,
} from "./validation";
export type { ValidationResult, ValidationCheck } from "./validation";

// Consent Mode v2
export {
  initializeConsentMode,
  grantFullConsent,
  grantAnalyticsOnly,
  revokeConsent,
  updateConsent,
  getConsentState,
  isAnalyticsAllowed,
  isMarketingAllowed,
  trackWithConsent,
  getConsentDataLayerEntry,
} from "./consent";

// Deduplication
export {
  generateTraceId,
  hashEventContent,
  shouldSendEvent,
  markEventSent,
  wasEventSent,
  getDedupeStats,
  clearDeduplication,
} from "./deduplication";

// Privacy Layer
export {
  detectPii,
  isPiiFieldName,
  hashValue,
  redactValue,
  sanitizeData,
  shouldRetainData,
  getDataCategory,
  canProcessData,
  getCompliantClientId,
  getPrivacyAuditLog,
  getPrivacyMetrics,
  handleDataSubjectRequest,
  isGdprCompliant,
} from "./privacy";
export type { PrivacyLevel, PrivacyConfig } from "./privacy";

// Data Warehouse Schema (BigQuery Export)
export {
  WAREHOUSE_SCHEMA_VERSION,
  WAREHOUSE_CONFIG,
  transformToWarehouseFormat,
  getBigQuerySchema,
} from "./warehouse";
export type {
  WarehouseEvent,
  WarehouseEventInput,
  DeviceInfo,
  GeoInfo,
  AppInfo,
  TrafficSource,
  FlowauxiMetadata,
  ParamStruct,
} from "./warehouse";

// Schema Governance
export {
  CURRENT_SCHEMA_VERSION,
  SCHEMA_EPOCH,
  getSchemaVersion,
  getLatestEventVersion,
  getEventVersions,
  isEventVersionDeprecated,
  migrateEvent,
  validateEventSchema,
  getSchemaManifest,
  enrichWithSchema,
  getSchemaMetadata,
} from "./governance";
export type { SchemaVersion, EventVersion, MigrationDirection, SchemaManifest } from "./governance";

// Event Recovery System
export {
  queueForRecovery,
  processRecoveryQueue,
  replayEvent,
  replayAllFailed,
  getRecoveryStats,
  getRecoveryEvents,
  getRecoveryEvent,
  runRecoveryCron,
} from "./recovery";
export type { EventStatus, RecoveryEvent } from "./recovery";
