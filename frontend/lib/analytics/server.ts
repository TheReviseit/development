/**
 * GA4 Measurement Protocol — Server-Side Tracking
 * ==================================================
 *
 * FAANG-Level server-side analytics via GA4 Measurement Protocol.
 *
 * WHY server-side tracking:
 *   1. Ad blockers kill ~30% of client-side tracking
 *   2. Revenue events MUST be tracked reliably (server-side is immune)
 *   3. Accurate attribution for purchases/subscriptions
 *   4. Backend-only events (webhook callbacks, cron jobs, etc.)
 *
 * Architecture:
 *   Client ──→ Next.js API route ──→ trackServerEvent() ──→ GA4 Measurement Protocol
 *   Backend ──→ trackServerEvent() ──→ GA4 Measurement Protocol
 *
 * @see https://developers.google.com/analytics/devguides/collection/protocol/ga4
 * @see https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference
 */

import {
  MEASUREMENT_PROTOCOL_CONFIG,
  resolveDomainConfig,
} from "./config";
import type { AnalyticsEvent, AnalyticsEventName } from "./events";
import { isValidEventName, ANALYTICS_SCHEMA_VERSION } from "./events";

// =============================================================================
// TYPES
// =============================================================================

/** GA4 Measurement Protocol event shape */
interface MeasurementProtocolEvent {
  name: string;
  params: Record<string, unknown>;
}

/** Measurement Protocol request body */
interface MeasurementProtocolPayload {
  client_id: string;
  user_id?: string;
  timestamp_micros?: string;
  non_personalized_ads?: boolean;
  events: MeasurementProtocolEvent[];
}

/** Result of a server-side tracking call */
export interface ServerTrackingResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  validationMessages?: unknown[];
  timestamp: number;
}

// =============================================================================
// SERVER-SIDE EVENT TRACKING
// =============================================================================

/**
 * Send events to GA4 via the Measurement Protocol.
 *
 * This function is designed to be called from:
 *   - Next.js API routes
 *   - Server Actions
 *   - Webhook handlers
 *   - Backend services
 *
 * @param clientId - GA4 client_id (from _ga cookie or generated)
 * @param events - Array of typed analytics events
 * @param options - Additional options
 */
export async function trackServerEvent(
  clientId: string,
  events: AnalyticsEvent[],
  options?: {
    /** User ID for cross-device tracking */
    userId?: string;
    /** Hostname for measurement ID resolution */
    hostname?: string;
    /** Use debug endpoint for validation */
    debug?: boolean;
    /** Custom timestamp (microseconds since epoch) */
    timestampMicros?: string;
  }
): Promise<ServerTrackingResult> {
  const hostname = options?.hostname || "flowauxi.com";
  const domainConfig = resolveDomainConfig(hostname);
  const apiSecret = MEASUREMENT_PROTOCOL_CONFIG.getApiSecret();

  // Validate API secret exists
  if (!apiSecret) {
    return {
      success: false,
      error: "ANALYTICS_API_SECRET environment variable is not set. Server-side tracking is disabled.",
      timestamp: Date.now(),
    };
  }

  // Validate events against schema
  const validatedEvents: MeasurementProtocolEvent[] = [];
  for (const event of events) {
    if (!isValidEventName(event.name)) {
      console.warn(
        `[Analytics:Server] Invalid event name: ${event.name}. Skipping.`
      );
      continue;
    }

    validatedEvents.push({
      name: event.name,
      params: {
        ...event.params,
        // Add metadata
        _schema_version: ANALYTICS_SCHEMA_VERSION,
        _source: "server",
        engagement_time_msec: "100", // Required by Measurement Protocol
      },
    });
  }

  if (validatedEvents.length === 0) {
    return {
      success: false,
      error: "No valid events to send",
      timestamp: Date.now(),
    };
  }

  // Build the payload
  const payload: MeasurementProtocolPayload = {
    client_id: clientId,
    events: validatedEvents,
    // Privacy: anonymous pings (no IP stored)
    non_personalized_ads: true,
  };

  if (options?.userId) {
    payload.user_id = options.userId;
  }

  if (options?.timestampMicros) {
    payload.timestamp_micros = options.timestampMicros;
  }

  // Select endpoint
  const endpoint = options?.debug
    ? MEASUREMENT_PROTOCOL_CONFIG.debugEndpoint
    : MEASUREMENT_PROTOCOL_CONFIG.endpoint;

  const url = `${endpoint}?measurement_id=${domainConfig.measurementId}&api_secret=${apiSecret}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    // Debug endpoint returns validation messages
    let validationMessages: unknown[] | undefined;
    if (options?.debug) {
      try {
        const debugResponse = await response.json();
        validationMessages = debugResponse?.validationMessages;
      } catch {
        // Ignore JSON parse errors for non-debug
      }
    }

    const result: ServerTrackingResult = {
      success: response.ok,
      statusCode: response.status,
      timestamp: Date.now(),
      validationMessages,
    };

    if (!response.ok) {
      result.error = `Measurement Protocol returned ${response.status}`;
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
      timestamp: Date.now(),
    };
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Track a purchase event server-side.
 * This ensures revenue tracking is not affected by ad blockers.
 *
 * Should be called from the payment success webhook/handler.
 */
export async function trackServerPurchase(
  clientId: string,
  purchase: {
    transactionId: string;
    value: number;
    currency: string;
    plan: string;
    domain: string;
    userId?: string;
  }
): Promise<ServerTrackingResult> {
  const event: AnalyticsEvent = {
    name: "purchase",
    params: {
      transaction_id: purchase.transactionId,
      value: purchase.value,
      currency: purchase.currency,
      items: [
        {
          item_id: purchase.plan,
          item_name: `${purchase.domain} - ${purchase.plan}`,
          item_category: purchase.domain,
          price: purchase.value,
          quantity: 1,
        },
      ],
    },
  };

  return trackServerEvent(clientId, [event], {
    userId: purchase.userId,
    hostname:
      purchase.domain === "shop"
        ? "shop.flowauxi.com"
        : "flowauxi.com",
  });
}

/**
 * Track a signup event server-side.
 */
export async function trackServerSignup(
  clientId: string,
  signup: {
    method: "email" | "google" | "facebook" | "whatsapp";
    userId?: string;
    hostname?: string;
  }
): Promise<ServerTrackingResult> {
  const event: AnalyticsEvent = {
    name: "signup",
    params: {
      method: signup.method,
    },
  };

  return trackServerEvent(clientId, [event], {
    userId: signup.userId,
    hostname: signup.hostname,
  });
}

// =============================================================================
// CLIENT ID UTILITIES
// =============================================================================

/**
 * Extract GA4 client_id from the _ga cookie.
 *
 * The _ga cookie format is: GA1.1.XXXXXXXXXX.YYYYYYYYYY
 * The client_id is: XXXXXXXXXX.YYYYYYYYYY
 *
 * @param gaCookie - The _ga cookie value
 */
export function extractClientIdFromCookie(
  gaCookie: string | undefined | null
): string | null {
  if (!gaCookie) return null;

  // GA cookie format: GA1.1.XXXXXXXXXX.YYYYYYYYYY
  const parts = gaCookie.split(".");
  if (parts.length >= 4) {
    return `${parts[2]}.${parts[3]}`;
  }

  return null;
}

/**
 * Generate a fallback client_id when _ga cookie is not available.
 * Uses a deterministic format compatible with GA4.
 */
export function generateServerClientId(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = Math.floor(Math.random() * 1_000_000_000);
  return `${random}.${timestamp}`;
}
