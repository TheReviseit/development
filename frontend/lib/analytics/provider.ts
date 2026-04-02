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
   *
   * @returns true if the event was dispatched
   */
  trackEvent(event: AnalyticsEvent): boolean;

  /**
   * Track a pageview.
   *
   * @returns true if the pageview was dispatched
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
// GOOGLE ANALYTICS 4 PROVIDER
// =============================================================================

/**
 * Google Analytics 4 provider implementation.
 *
 * Uses the gtag.js wrapper from ./gtag.ts for all operations.
 * All events also flow through the Data Layer for GTM compatibility.
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

    pushToDataLayer(event);

    if (gtagBlocked) {
      if (isDebugMode()) {
        console.log(
          `%c[Analytics:GA4] gtag blocked, using fallback queue`,
          "color: #F59E0B;",
          { event: event.name }
        );
      }

      enqueueEvent(event.name, event.params as Record<string, unknown>);
      analyticsHealth.record("event_queued", { event: event.name });
      return true;
    }

    return gtagEvent(event.name, event.params as Record<string, unknown>);
  }

  trackPageview(url: string, title?: string): boolean {
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

    pushToDataLayer({
      name: "page_view",
      params: {
        page_path: url,
        page_title: title,
      },
    });

    const health = getAnalyticsHealth();
    const gtagBlocked = health.scriptBlocked || health.scriptLoaded === false;

    if (gtagBlocked) {
      enqueueEvent("page_view", {
        page_path: url,
        page_title: title,
      });
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
  }

  isInitialized(): boolean {
    return isGtagInitialized();
  }

  /** Get the active measurement ID */
  getMeasurementId(): string | null {
    return getActiveMeasurementId();
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
