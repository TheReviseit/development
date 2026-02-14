/**
 * Enterprise Observability System
 * =================================
 * FAANG-level structured logging, metrics tracking, and telemetry
 */

import { v4 as uuidv4 } from "uuid";
import type { ProductDomain } from "../domain/config";
import type { PlanTier } from "../pricing/pricing-config";

// =============================================================================
// CORRELATION ID FOR DISTRIBUTED TRACING
// =============================================================================

/**
 * Get or create correlation ID for request tracing
 * Persists across the user session for distributed tracing
 */
export function getCorrelationId(): string {
  if (typeof window === "undefined") return uuidv4();

  let correlationId = sessionStorage.getItem("correlation_id");
  if (!correlationId) {
    correlationId = uuidv4();
    sessionStorage.setItem("correlation_id", correlationId);
  }
  return correlationId;
}

/**
 * Generate a new request ID for a specific operation
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// =============================================================================
// STRUCTURED LOGGING
// =============================================================================

interface LogMetadata extends Record<string, any> {
  correlationId?: string;
  requestId?: string;
  userId?: string;
  domain?: ProductDomain;
  timestamp?: string;
}

export const logger = {
  /**
   * Info level logging
   */
  info: (event: string, metadata: LogMetadata = {}) => {
    const logEntry = {
      level: "INFO",
      event,
      timestamp: new Date().toISOString(),
      correlationId: getCorrelationId(),
      ...metadata,
    };

    console.log(JSON.stringify(logEntry));

    // In production, send to logging service (CloudWatch, DataDog, etc.)
    if (process.env.NODE_ENV === "production") {
      sendToLoggingService(logEntry);
    }
  },

  /**
   * Error level logging
   */
  error: (event: string, error: Error, metadata: LogMetadata = {}) => {
    const logEntry = {
      level: "ERROR",
      event,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      timestamp: new Date().toISOString(),
      correlationId: getCorrelationId(),
      ...metadata,
    };

    console.error(JSON.stringify(logEntry));

    // In production, send to error tracking (Sentry, Rollbar, etc.)
    if (process.env.NODE_ENV === "production") {
      sendToErrorTracking(error, metadata);
      sendToLoggingService(logEntry);
    }
  },

  /**
   * Warning level logging
   */
  warn: (event: string, metadata: LogMetadata = {}) => {
    const logEntry = {
      level: "WARN",
      event,
      timestamp: new Date().toISOString(),
      correlationId: getCorrelationId(),
      ...metadata,
    };

    console.warn(JSON.stringify(logEntry));

    if (process.env.NODE_ENV === "production") {
      sendToLoggingService(logEntry);
    }
  },

  /**
   * Debug level logging (only in development)
   */
  debug: (event: string, metadata: LogMetadata = {}) => {
    if (process.env.NODE_ENV !== "development") return;

    const logEntry = {
      level: "DEBUG",
      event,
      timestamp: new Date().toISOString(),
      correlationId: getCorrelationId(),
      ...metadata,
    };

    console.debug(JSON.stringify(logEntry));
  },
};

// =============================================================================
// REVENUE TRACKING
// =============================================================================

interface RevenueData {
  domain: ProductDomain;
  plan: PlanTier;
  amount: number;
  currency: string;
  subscriptionId: string;
  userId?: string;
}

/**
 * Track revenue events for analytics
 * Integrates with Google Analytics 4, Mixpanel, Segment, etc.
 */
export function trackRevenue(data: RevenueData): void {
  logger.info("revenue.generated", {
    domain: data.domain,
    plan: data.plan,
    amount: data.amount,
    currency: data.currency,
    subscriptionId: data.subscriptionId,
    userId: data.userId,
  });

  // Google Analytics 4
  if (typeof window !== "undefined" && (window as any).gtag) {
    (window as any).gtag("event", "purchase", {
      transaction_id: data.subscriptionId,
      value: data.amount,
      currency: data.currency,
      items: [
        {
          item_id: data.plan,
          item_name: `${data.domain} - ${data.plan}`,
          item_category: data.domain,
          price: data.amount,
          quantity: 1,
        },
      ],
    });
  }

  // Mixpanel (if available)
  if (typeof window !== "undefined" && (window as any).mixpanel) {
    (window as any).mixpanel.track("Purchase", {
      domain: data.domain,
      plan: data.plan,
      amount: data.amount,
      currency: data.currency,
      subscription_id: data.subscriptionId,
    });
  }
}

// =============================================================================
// CONVERSION FUNNEL TRACKING
// =============================================================================

type FunnelStep =
  | "pricing_viewed"
  | "pricing_card_clicked"
  | "plan_selected"
  | "whatsapp_connection_started"
  | "whatsapp_connected"
  | "payment_initiated"
  | "payment_success"
  | "payment_failed"
  | "subscription_activated";

interface FunnelMetadata {
  domain: ProductDomain;
  plan?: PlanTier;
  userId?: string;
  [key: string]: any;
}

/**
 * Track conversion funnel steps
 */
export function trackFunnelStep(
  step: FunnelStep,
  metadata: FunnelMetadata,
): void {
  const eventData = {
    step,
    ...metadata,
    timestamp: new Date().toISOString(),
    correlationId: getCorrelationId(),
  };

  logger.info(`funnel.${step}`, eventData);

  // Google Analytics
  if (typeof window !== "undefined" && (window as any).gtag) {
    (window as any).gtag("event", step, {
      event_category: "funnel",
      event_label: metadata.domain,
      value: metadata.plan,
      ...metadata,
    });
  }

  // Mixpanel
  if (typeof window !== "undefined" && (window as any).mixpanel) {
    (window as any).mixpanel.track(step, eventData);
  }
}

// =============================================================================
// PERFORMANCE MONITORING
// =============================================================================

export class PerformanceMonitor {
  private startTimes: Map<string, number> = new Map();

  /**
   * Start timing an operation
   */
  startTimer(operationId: string): void {
    this.startTimes.set(operationId, performance.now());
  }

  /**
   * End timing and log performance metric
   */
  endTimer(operationId: string, metadata: Record<string, any> = {}): void {
    const startTime = this.startTimes.get(operationId);
    if (!startTime) {
      logger.warn("performance.timer_not_started", { operationId });
      return;
    }

    const duration = performance.now() - startTime;
    this.startTimes.delete(operationId);

    logger.info("performance.metric", {
      operation: operationId,
      duration_ms: Math.round(duration),
      ...metadata,
    });

    // Alert if operation is too slow (>3 seconds)
    if (duration > 3000) {
      logger.error(
        "performance.slow_operation",
        new Error("Operation exceeded performance threshold"),
        {
          operation: operationId,
          duration_ms: Math.round(duration),
          threshold_ms: 3000,
          ...metadata,
        },
      );
    }

    // Send to performance monitoring service
    if (process.env.NODE_ENV === "production") {
      sendPerformanceMetric(operationId, duration, metadata);
    }
  }

  /**
   * Measure async operation
   */
  async measure<T>(
    operationId: string,
    fn: () => Promise<T>,
    metadata: Record<string, any> = {},
  ): Promise<T> {
    this.startTimer(operationId);
    try {
      const result = await fn();
      this.endTimer(operationId, { ...metadata, success: true });
      return result;
    } catch (error) {
      this.endTimer(operationId, {
        ...metadata,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }
}

// Global performance monitor instance
export const perfMonitor = new PerformanceMonitor();

// =============================================================================
// INTEGRATION WITH EXTERNAL SERVICES
// =============================================================================

/**
 * Send log entry to centralized logging service
 * Replace with actual implementation for your logging provider
 */
function sendToLoggingService(logEntry: any): void {
  // Example: CloudWatch Logs
  // const AWS = require('aws-sdk');
  // const cloudwatchlogs = new AWS.CloudWatchLogs();
  // cloudwatchlogs.putLogEvents({ ... });
  // Example: DataDog
  // fetch('https://http-intake.logs.datadoghq.com/v1/input', {
  //   method: 'POST',
  //   headers: { 'DD-API-KEY': process.env.DATADOG_API_KEY },
  //   body: JSON.stringify(logEntry)
  // });
  // For now, just console log in production
  // TODO: Implement actual logging service integration
}

/**
 * Send error to error tracking service
 */
function sendToErrorTracking(error: Error, metadata: any): void {
  // Example: Sentry
  // if (typeof window !== 'undefined' && (window as any).Sentry) {
  //   (window as any).Sentry.captureException(error, { extra: metadata });
  // }
  // TODO: Implement actual error tracking integration
}

/**
 * Send performance metric to APM service
 */
function sendPerformanceMetric(
  operation: string,
  duration: number,
  metadata: any,
): void {
  // Example: New Relic
  // if (typeof window !== 'undefined' && (window as any).newrelic) {
  //   (window as any).newrelic.addPageAction('PerformanceMetric', {
  //     operation,
  //     duration,
  //     ...metadata
  //   });
  // }
  // TODO: Implement actual APM integration
}

// =============================================================================
// EXPORTS
// =============================================================================

export type { FunnelStep, FunnelMetadata, LogMetadata, RevenueData };
