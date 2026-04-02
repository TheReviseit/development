/**
 * Analytics Provider Abstraction
 * ================================
 *
 * Abstract provider pattern for analytics services.
 *
 * This enables:
 *   1. Multiple analytics providers running simultaneously
 *   2. Easy addition of Mixpanel, Segment, Amplitude etc.
 *   3. Provider-agnostic event dispatch
 *   4. Consistent initialization and lifecycle management
 *   5. Consent mode integration
 *   6. Event deduplication
 *
 * Architecture:
 *   AnalyticsProviderInterface (abstract)
 *     ├── GoogleAnalyticsProvider (implemented)
 *     ├── MixpanelProvider (future)
 *     └── SegmentProvider (future)
 *
 * @see lib/analytics/index.ts for the orchestration layer
 */

import type { AnalyticsResolvedConfig } from "./config";
import type { AnalyticsEvent } from "./events";
import type { UserTraits } from "./events";
import {
  initializeGtag,
  gtagEvent,
  gtagPageview,
  gtagSetUser,
  isGtagInitialized,
  getActiveMeasurementId,
} from "./gtag";
import { pushToDataLayer, pushUserProperties } from "./dataLayer";
import { analyticsHealth, getAnalyticsHealth } from "./health";
import { isDebugMode } from "./config";
import { enqueueEvent, hasQueuedEvents, drainQueue } from "./fallbackQueue";
import { shouldSendEvent, generateTraceId } from "./deduplication";
import { trackWithConsent, getConsentState } from "./consent";

// =============================================================================
// ABSTRACT PROVIDER INTERFACE
// =============================================================================

/**
 * Analytics provider interface.
 * All analytics services must implement this interface.
 *
 * Lifecycle:
 *   1. Constructor (no side effects)
 *   2. initialize() — load scripts, set up SDK
 *   3. trackEvent() / trackPageview() / setUser() — runtime operations
 *   4. isInitialized() — state check
 */
export interface AnalyticsProviderInterface {
  /** Unique provider name (for logging and health monitoring) */
  readonly name: string;

  /** Provider version (for debugging) */
  readonly version: string;

  /**
   * Initialize the provider with the resolved config.
   * Should be idempotent — safe to call multiple times.
   *
   * @returns true if initialization succeeded
   */
  initialize(config: AnalyticsResolvedConfig): Promise<boolean>;

  /**
   * Track a typed analytics event.
   * The event has already been validated against the schema.
   * Implements consent-aware + deduplicated tracking.
   *
   * @returns true if event was dispatched
   */
  trackEvent(event: AnalyticsEvent): boolean;

  /**
   * Track a pageview.
   *
   * @returns true if pageview was dispatched
   */
  trackPageview(url: string, title?: string): boolean;

  /**
   * Set user identity for cross-session tracking.
   */
  setUser(userId: string, traits?: UserTraits): void;

  /**
   * Check if the provider has been successfully initialized.
   */
  isInitialized(): boolean;
}

// =============================================================================
// GOOGLE ANALYTICS 4 PROVIDER (FAANG LEVEL)
// =============================================================================

/**
 * Google Analytics 4 provider implementation.
 *
 * Features:
 *   - Consent mode v2 integration
 *   - Event deduplication
 *   - Ad-blocker fallback to server
 *   - Data layer integration for GTM
 *   - Health monitoring
 */
export class GoogleAnalyticsProvider implements AnalyticsProviderInterface {
  readonly name = "google_analytics";
  readonly version = "4.0";

  private _config: AnalyticsResolvedConfig | null = null;

  async initialize(config: AnalyticsResolvedConfig): Promise<boolean> {
    this._config = config;

    if (!config.enabled) {
      if (config.debug) {
        console.log(
          "%c[Analytics:GA4] Disabled (environment check failed)",
          "color: #6B7280; font-weight: bold;"
        );
      }
      return false;
    }

    const success = await initializeGtag(
      config.domainConfig.measurementId,
      config.crossDomain
    );

    if (success && config.debug) {
      console.log(
        "%c[Analytics:GA4] ✅ Provider ready",
        "color: #10B981; font-weight: bold;",
        {
          measurementId: config.domainConfig.measurementId,
          domain: config.domainConfig.domain,
          stream: config.domainConfig.streamName,
        }
      );
    }

    return success;
  }

  trackEvent(event: AnalyticsEvent): boolean {
    const health = getAnalyticsHealth();
    const gtagBlocked = health.scriptBlocked || health.scriptLoaded === false;

    if (!this.isInitialized() && !gtagBlocked) {
      analyticsHealth.record("event_dropped", {
        provider: this.name,
        event: event.name,
        reason: "provider not initialized",
      });
      return false;
    }

    // CONSENT CHECK: Track with consent awareness
    // This implements cookieless pings when consent not granted
    const consentResult = trackWithConsent(event.name, event.params);
    if (!consentResult) {
      return false;
    }

    // DEDUPLICATION: Check if event should be sent
    // Prevents client+server double counting
    const dedupResult = shouldSendEvent(event.name, event.params, "client");

    if (!dedupResult.isDuplicate) {
      // Add trace_id to event params for debugging
      // Cast to any to bypass strict type check - trace_id is a meta-field for debugging
      const eventWithTrace = {
        ...event,
        params: {
          ...event.params,
          trace_id: dedupResult.traceId,
        },
      } as unknown as AnalyticsEvent;

      // Push to data layer (GTM compatible)
      pushToDataLayer(eventWithTrace);
    }

    // Route based on gtag availability
    if (gtagBlocked) {
      if (isDebugMode()) {
        console.log(
          `%c[Analytics:GA4] gtag blocked, using fallback queue`,
          "color: #F59E0B;",
          { event: event.name, dedup: dedupResult.isDuplicate }
        );
      }

      // Only queue if not a duplicate
      if (!dedupResult.isDuplicate) {
        enqueueEvent(event.name, event.params as Record<string, unknown>);
        analyticsHealth.record("event_queued", { event: event.name });
      }
      return true;
    }

    // gtag available - send event
    // Even if dedup, still send to maintain client-side accuracy
    const sent = gtagEvent(event.name, {
      ...event.params,
      trace_id: dedupResult.traceId,
    });

    if (sent) {
      analyticsHealth.record("event_sent", { event: event.name });
    }

    return sent;
  }

  trackPageview(url: string, title?: string): boolean {
    // Check provider initialization
    if (!this.isInitialized()) {
      const health = getAnalyticsHealth();
      const gtagBlocked = health.scriptBlocked || health.scriptLoaded === false;

      if (gtagBlocked) {
        enqueueEvent("page_view", {
          page_path: url,
          page_title: title,
          page_location: typeof window !== "undefined" ? window.location.href : undefined,
        });
        return true;
      }
      return false;
    }

    // Consent check for pageview
    trackWithConsent("page_view", { page_path: url, page_title: title });

    // Deduplication for pageview
    const dedupResult = shouldSendEvent("page_view", { page_path: url, page_title: title }, "client");

    // Push to data layer (GTM compatible)
    pushToDataLayer({
      name: "page_view",
      params: {
        page_path: url,
        page_title: title,
        page_location: typeof window !== "undefined" ? window.location.href : undefined,
        trace_id: dedupResult.traceId,
      },
    } as unknown as AnalyticsEvent);

    // Check if gtag is blocked
    const health = getAnalyticsHealth();
    const gtagBlocked = health.scriptBlocked || health.scriptLoaded === false;

    if (gtagBlocked) {
      if (!dedupResult.isDuplicate) {
        enqueueEvent("page_view", {
          page_path: url,
          page_title: title,
        });
      }
      return true;
    }

    return gtagPageview(url, title);
  }

  setUser(userId: string, traits?: UserTraits): void {
    if (!this.isInitialized()) return;

    // Push to data layer
    pushUserProperties(userId, traits as Record<string, unknown>);

    // Set in gtag
    gtagSetUser(userId, traits as Record<string, unknown>);

    analyticsHealth.record("user_identified", { userId });
  }

  isInitialized(): boolean {
    return isGtagInitialized();
  }

  /** Get the active measurement ID */
  getMeasurementId(): string | null {
    return getActiveMeasurementId();
  }

  /** Get current consent state */
  getConsentState() {
    return getConsentState();
  }
}

// =============================================================================
// PROVIDER REGISTRY
// =============================================================================

/**
 * Registry of all analytics providers.
 * Add new providers here to automatically include them in event dispatch.
 */
export class AnalyticsProviderRegistry {
  private providers: Map<string, AnalyticsProviderInterface> = new Map();

  /**
   * Register a provider.
   */
  register(provider: AnalyticsProviderInterface): void {
    this.providers.set(provider.name, provider);

    if (isDebugMode()) {
      console.log(
        `%c[Analytics:Registry] Registered provider: ${provider.name} v${provider.version}`,
        "color: #8B5CF6; font-weight: bold;"
      );
    }
  }

  /**
   * Initialize all registered providers.
   */
  async initializeAll(config: AnalyticsResolvedConfig): Promise<void> {
    const promises = Array.from(this.providers.values()).map(
      async (provider) => {
        try {
          const success = await provider.initialize(config);
          if (!success) {
            analyticsHealth.record("provider_failed", {
              provider: provider.name,
              reason: "initialize returned false",
            });
          }
        } catch (error) {
          analyticsHealth.record("provider_failed", {
            provider: provider.name,
            error: error instanceof Error ? error.message : "Unknown",
          });
        }
      }
    );

    await Promise.allSettled(promises);
  }

  /**
   * Dispatch an event to all initialized providers.
   */
  trackEvent(event: AnalyticsEvent): void {
    for (const provider of this.providers.values()) {
      if (provider.isInitialized()) {
        provider.trackEvent(event);
      }
    }
  }

  /**
   * Dispatch a pageview to all initialized providers.
   */
  trackPageview(url: string, title?: string): void {
    for (const provider of this.providers.values()) {
      if (provider.isInitialized()) {
        provider.trackPageview(url, title);
      }
    }
  }

  /**
   * Set user identity across all providers.
   */
  setUser(userId: string, traits?: UserTraits): void {
    for (const provider of this.providers.values()) {
      if (provider.isInitialized()) {
        provider.setUser(userId, traits);
      }
    }
  }

  /**
   * Get all registered provider names.
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if any provider is initialized.
   */
  hasInitializedProvider(): boolean {
    return Array.from(this.providers.values()).some((p) => p.isInitialized());
  }
}