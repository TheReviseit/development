/**
 * Analytics Health Monitoring
 * ============================
 *
 * FAANG-Level observability for the analytics system itself.
 *
 * Tracks:
 *   - Events sent vs dropped
 *   - Script load success/failure
 *   - Provider initialization state
 *   - Consent state transitions
 *   - Ad blocker detection
 *   - Event queue overflow
 *
 * This ensures analytics reliability is MEASURABLE and ALERTABLE,
 * not a black box that silently loses data.
 *
 * @see lib/observability/observability.ts for the main logging system
 */

import { isDebugMode } from "./config";

// =============================================================================
// TYPES
// =============================================================================

export type HealthEventType =
  | "event_sent"
  | "event_dropped"
  | "event_queued"
  | "event_attempted"
  | "event_cookieless"
  | "event_deduplicated"
  | "script_loaded"
  | "script_failed"
  | "provider_initialized"
  | "provider_failed"
  | "consent_granted"
  | "consent_denied"
  | "consent_revoked"
  | "ad_blocker_detected"
  | "server_event_sent"
  | "server_event_failed"
  | "server_event_deduplicated"
  | "server_event_cookieless"
  | "server_circuit_breaker_open"
  | "server_circuit_breaker_triggered"
  | "server_event_error"
  | "recovery_event_queued"
  | "recovery_critical_queued"
  | "recovery_event_success"
  | "recovery_event_quarantined"
  | "recovery_event_retry"
  | "recovery_manual_replay_success"
  | "recovery_manual_replay_failed"
  | "user_identified";

export interface HealthMetrics {
  /** Total events attempted */
  totalEventsAttempted: number;
  /** Events successfully dispatched */
  eventsSent: number;
  /** Events dropped (provider not ready, consent denied, etc.) */
  eventsDropped: number;
  /** Events sent via server-side */
  serverEventsSent: number;
  /** Events failed via server-side */
  serverEventsFailed: number;
  /** Whether gtag.js script loaded successfully */
  scriptLoaded: boolean;
  /** Whether script load was blocked (ad blocker) */
  scriptBlocked: boolean;
  /** Number of provider initializations */
  providersInitialized: number;
  /** Number of provider init failures */
  providersFailed: number;
  /** Current consent state */
  consentState: "unknown" | "granted" | "denied" | "revoked";
  /** Drop rate percentage */
  dropRate: number;
  /** Session start time */
  sessionStart: number;
  /** Last event timestamp */
  lastEventAt: number | null;
  /** Health alerts triggered */
  alerts: HealthAlert[];
}

export interface HealthAlert {
  type: "high_drop_rate" | "script_blocked" | "provider_failure" | "no_events" | "server_circuit_breaker";
  message: string;
  timestamp: number;
  severity: "warning" | "critical";
}

// =============================================================================
// HEALTH MONITOR SINGLETON
// =============================================================================

/**
 * Analytics health monitor.
 * Singleton that tracks analytics system health throughout the session.
 */
class AnalyticsHealthMonitor {
  private metrics: Omit<HealthMetrics, "dropRate" | "alerts"> & {
    alerts: HealthAlert[];
  };

  /** Alert thresholds */
  private static readonly DROP_RATE_WARNING = 20; // 20% drops → warning
  private static readonly DROP_RATE_CRITICAL = 50; // 50% drops → critical
  private static readonly MIN_EVENTS_FOR_ALERT = 10; // Don't alert until 10+ events

  constructor() {
    this.metrics = {
      totalEventsAttempted: 0,
      eventsSent: 0,
      eventsDropped: 0,
      serverEventsSent: 0,
      serverEventsFailed: 0,
      scriptLoaded: false,
      scriptBlocked: false,
      providersInitialized: 0,
      providersFailed: 0,
      consentState: "unknown",
      sessionStart: Date.now(),
      lastEventAt: null,
      alerts: [],
    };
  }

  /**
   * Record a health event.
   * Central method for all health tracking.
   */
  record(type: HealthEventType, metadata?: Record<string, unknown>): void {
    switch (type) {
      case "event_sent":
        this.metrics.totalEventsAttempted++;
        this.metrics.eventsSent++;
        this.metrics.lastEventAt = Date.now();
        break;

      case "event_dropped":
        this.metrics.totalEventsAttempted++;
        this.metrics.eventsDropped++;
        break;

      case "event_queued":
        // Queued events are tracked but not counted as sent/dropped yet
        break;

      case "script_loaded":
        this.metrics.scriptLoaded = true;
        break;

      case "script_failed":
        this.metrics.scriptBlocked = true;
        this.addAlert({
          type: "script_blocked",
          message: "Analytics script failed to load (possible ad blocker)",
          severity: "warning",
        });
        break;

      case "provider_initialized":
        this.metrics.providersInitialized++;
        break;

      case "provider_failed":
        this.metrics.providersFailed++;
        this.addAlert({
          type: "provider_failure",
          message: `Analytics provider initialization failed: ${metadata?.provider || "unknown"}`,
          severity: "critical",
        });
        break;

      case "consent_granted":
        this.metrics.consentState = "granted";
        break;

      case "consent_denied":
        this.metrics.consentState = "denied";
        break;

      case "consent_revoked":
        this.metrics.consentState = "revoked";
        break;

      case "ad_blocker_detected":
        this.metrics.scriptBlocked = true;
        this.addAlert({
          type: "script_blocked",
          message: "Ad blocker detected — client-side analytics disabled",
          severity: "warning",
        });
        break;

      case "server_event_sent":
        this.metrics.serverEventsSent++;
        break;

      case "server_event_failed":
        this.metrics.serverEventsFailed++;
        break;

      case "event_attempted":
        this.metrics.totalEventsAttempted++;
        break;

      case "event_cookieless":
        // Cookieless events still count as attempts
        break;

      case "event_deduplicated":
        // Deduplicated events don't increment sent/dropped
        break;

      case "server_event_deduplicated":
        break;

      case "server_event_cookieless":
        break;

      case "server_circuit_breaker_open":
        this.addAlert({
          type: "server_circuit_breaker",
          message: "Server-side analytics circuit breaker open",
          severity: "warning",
        });
        break;

      case "server_circuit_breaker_triggered":
        this.addAlert({
          type: "server_circuit_breaker",
          message: "Server-side analytics circuit breaker triggered",
          severity: "critical",
        });
        break;

      case "server_event_error":
        this.metrics.serverEventsFailed++;
        break;

      case "recovery_event_queued":
      case "recovery_critical_queued":
      case "recovery_event_success":
      case "recovery_event_quarantined":
      case "recovery_event_retry":
      case "recovery_manual_replay_success":
      case "recovery_manual_replay_failed":
        // Recovery events tracked separately
        break;

      case "user_identified":
        // User identification events
        break;
    }

    // Check for drop rate alerts
    this.checkDropRateAlert();

    // Debug logging
    if (isDebugMode()) {
      console.log(
        `%c[Analytics:Health] ${type}`,
        "color: #F59E0B; font-weight: bold;",
        { ...metadata, metrics: this.getReport() }
      );
    }
  }

  /**
   * Get the current health report.
   */
  getReport(): HealthMetrics {
    const dropRate =
      this.metrics.totalEventsAttempted > 0
        ? (this.metrics.eventsDropped / this.metrics.totalEventsAttempted) * 100
        : 0;

    return {
      ...this.metrics,
      dropRate: Math.round(dropRate * 100) / 100,
    };
  }

  /**
   * Check if analytics is healthy.
   * Returns false if drop rate is above critical threshold.
   */
  isHealthy(): boolean {
    const report = this.getReport();
    return (
      report.dropRate < AnalyticsHealthMonitor.DROP_RATE_CRITICAL &&
      !report.alerts.some((a) => a.severity === "critical")
    );
  }

  /**
   * Reset metrics (for testing or session boundary).
   */
  reset(): void {
    this.metrics = {
      totalEventsAttempted: 0,
      eventsSent: 0,
      eventsDropped: 0,
      serverEventsSent: 0,
      serverEventsFailed: 0,
      scriptLoaded: false,
      scriptBlocked: false,
      providersInitialized: 0,
      providersFailed: 0,
      consentState: "unknown",
      sessionStart: Date.now(),
      lastEventAt: null,
      alerts: [],
    };
  }

  // ── Private ──────────────────────────────────────────────────────────

  private addAlert(
    alert: Omit<HealthAlert, "timestamp">
  ): void {
    const fullAlert: HealthAlert = {
      ...alert,
      timestamp: Date.now(),
    };

    // Deduplicate: don't add the same alert type twice in 60 seconds
    const recentDuplicate = this.metrics.alerts.find(
      (a) =>
        a.type === fullAlert.type &&
        Date.now() - a.timestamp < 60_000
    );
    if (recentDuplicate) return;

    this.metrics.alerts.push(fullAlert);

    // Log critical alerts
    if (fullAlert.severity === "critical") {
      console.error(
        `[Analytics:Health:CRITICAL] ${fullAlert.message}`
      );
    }
  }

  private checkDropRateAlert(): void {
    if (
      this.metrics.totalEventsAttempted <
      AnalyticsHealthMonitor.MIN_EVENTS_FOR_ALERT
    ) {
      return;
    }

    const dropRate =
      (this.metrics.eventsDropped / this.metrics.totalEventsAttempted) * 100;

    if (dropRate >= AnalyticsHealthMonitor.DROP_RATE_CRITICAL) {
      this.addAlert({
        type: "high_drop_rate",
        message: `Analytics drop rate is ${dropRate.toFixed(1)}% (critical threshold: ${AnalyticsHealthMonitor.DROP_RATE_CRITICAL}%)`,
        severity: "critical",
      });
    } else if (dropRate >= AnalyticsHealthMonitor.DROP_RATE_WARNING) {
      this.addAlert({
        type: "high_drop_rate",
        message: `Analytics drop rate is ${dropRate.toFixed(1)}% (warning threshold: ${AnalyticsHealthMonitor.DROP_RATE_WARNING}%)`,
        severity: "warning",
      });
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/** Global health monitor instance */
export const analyticsHealth = new AnalyticsHealthMonitor();

/**
 * Convenience function to get the health report.
 * Can be called from browser console: getAnalyticsHealth()
 */
export function getAnalyticsHealth(): HealthMetrics {
  return analyticsHealth.getReport();
}

// Expose on window for production debugging
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__flowauxi_analytics_health =
    () => analyticsHealth.getReport();
}
