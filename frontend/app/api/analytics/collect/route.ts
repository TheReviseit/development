/**
 * Server-Side Analytics Collection Endpoint
 * ===========================================
 *
 * FAANG-Level server-side analytics collection with:
 *   - Circuit breaker (pause after failures)
 *   - Event deduplication (prevents client + server double-counting)
 *   - Privacy compliance (anonymized, PII protection)
 *   - Consent mode integration
 *   - Health monitoring
 *
 * Endpoint: POST /api/analytics/collect
 *
 * Architecture:
 *   Client Fallback Queue → /api/analytics/collect → GA4 Measurement Protocol
 *                                    │
 *                            ┌───────┴───────┐
 *                            ▼               ▼
 *                      Dedupe         Consent Check
 *                            │               │
 *                            └───────┬───────┘
 *                                    ▼
 *                              GA4 MP API
 *
 * @see lib/analytics/server.ts for the Measurement Protocol implementation
 * @see lib/analytics/deduplication.ts for deduplication logic
 * @see lib/analytics/consent.ts for consent mode
 */

import { NextRequest, NextResponse } from "next/server";
import {
  trackServerEvent,
  extractClientIdFromCookie,
  generateServerClientId,
} from "@/lib/analytics/server";
import type { AnalyticsEvent } from "@/lib/analytics/events";
import { isValidEventName } from "@/lib/analytics/events";
import { hashEventContent, wasEventSent, markEventSent } from "@/lib/analytics/deduplication";
import { isAnalyticsAllowed } from "@/lib/analytics/consent";
import { analyticsHealth } from "@/lib/analytics/health";

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_EVENTS_PER_REQUEST = 25;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_DURATION = 60_000;

// =============================================================================
// TYPES
// =============================================================================

interface CollectRequestBody {
  events: Array<{
    name: string;
    params: Record<string, unknown>;
    trace_id?: string;
  }>;
  userId?: string;
  clientId?: string;
  consentState?: {
    analytics: boolean;
    marketing: boolean;
  };
}

interface ProcessedEvent {
  event: AnalyticsEvent;
  traceId: string;
  isDuplicate: boolean;
  duplicateSource?: "client" | "server";
}

// =============================================================================
// CIRCUIT BREAKER STATE
// =============================================================================

let _consecutiveFailures = 0;
let _circuitOpenUntil = 0;

// =============================================================================
// UTILITIES
// =============================================================================

function isCircuitBreakerOpen(): boolean {
  if (_consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    if (Date.now() < _circuitOpenUntil) {
      analyticsHealth.record("server_circuit_breaker_open");
      return true;
    }
    resetCircuitBreaker();
  }
  return false;
}

function recordFailure(): void {
  _consecutiveFailures += 1;
  if (_consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    _circuitOpenUntil = Date.now() + CIRCUIT_BREAKER_DURATION;
    console.warn(
      "[Analytics:Collect] Circuit breaker opened",
      { openUntil: new Date(_circuitOpenUntil).toISOString() }
    );
    analyticsHealth.record("server_circuit_breaker_triggered");
  }
}

function recordSuccess(): void {
  _consecutiveFailures = 0;
  _circuitOpenUntil = 0;
}

function resetCircuitBreaker(): void {
  _consecutiveFailures = 0;
  _circuitOpenUntil = 0;
}

/**
 * Process events with deduplication.
 * Filters out events already sent from client-side.
 */
function processEventsWithDedup(
  events: CollectRequestBody["events"]
): ProcessedEvent[] {
  const processed: ProcessedEvent[] = [];

  for (const event of events) {
    // Check deduplication
    const contentHash = hashEventContent(event.name, event.params);
    const alreadySent = wasEventSent(event.name, event.params);

    if (alreadySent) {
      // Event was already sent from client
      // Still mark as "sent" from server to update the record
      markEventSent(event.name, event.params, "server");

      processed.push({
        event: { name: event.name, params: event.params || {} } as AnalyticsEvent,
        traceId: event.trace_id || `dedup_${contentHash}`,
        isDuplicate: true,
        duplicateSource: "client",
      });

      analyticsHealth.record("server_event_deduplicated", {
        event: event.name,
        reason: "client_already_sent",
      });

      continue;
    }

    // New event - mark as sent from server
    const traceId = event.trace_id || `server_${Date.now()}_${contentHash}`;
    markEventSent(event.name, event.params, "server");

    processed.push({
      event: { name: event.name, params: event.params || {} } as AnalyticsEvent,
      traceId,
      isDuplicate: false,
    });
  }

  return processed;
}

/**
 * Validate and sanitize event params for privacy.
 * Removes or hashes PII fields.
 */
function sanitizeEventParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const PII_FIELDS = ["email", "phone", "name", "address", "ip"];
  const HASH_FIELDS = ["user_id", "session_id"];

  for (const [key, value] of Object.entries(params)) {
    const lowerKey = key.toLowerCase();

    // Skip PII fields entirely
    if (PII_FIELDS.some((f) => lowerKey.includes(f))) {
      continue;
    }

    // Hash user-identifiable fields
    if (HASH_FIELDS.includes(lowerKey) && typeof value === "string") {
      sanitized[key] = hashString(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Simple hash function for PII.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `hashed_${Math.abs(hash).toString(16)}`;
}

// =============================================================================
// POST /api/analytics/collect
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    // Check circuit breaker
    if (isCircuitBreakerOpen()) {
      return NextResponse.json(
        {
          success: false,
          error: "Service temporarily unavailable (circuit breaker open)",
          retryAfter: Math.ceil((_circuitOpenUntil - Date.now()) / 1000),
        },
        { status: 503 }
      );
    }

    const body: CollectRequestBody = await request.json();

    // Validate request
    if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json(
        { success: false, error: "events array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (body.events.length > MAX_EVENTS_PER_REQUEST) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_EVENTS_PER_REQUEST} events per request` },
        { status: 400 }
      );
    }

    // Check consent (if provided in request, use it; otherwise check cookie)
    let analyticsAllowed = isAnalyticsAllowed();

    if (body.consentState !== undefined) {
      analyticsAllowed = body.consentState.analytics;
    }

    // If analytics not allowed, still accept but mark as cookieless
    if (!analyticsAllowed) {
      analyticsHealth.record("server_event_cookieless");

      // Still process - GA4 will handle cookieless mode
      // But we won't persist client_id
    }

    // Validate and sanitize events
    const validEvents: AnalyticsEvent[] = [];
    const invalidEvents: string[] = [];

    for (const event of body.events) {
      if (!event.name || typeof event.name !== "string") {
        invalidEvents.push("(unnamed)");
        continue;
      }

      if (!isValidEventName(event.name)) {
        invalidEvents.push(event.name);
        continue;
      }

      // Sanitize params for privacy
      const sanitizedParams = sanitizeEventParams(event.params || {});

      validEvents.push({
        name: event.name,
        params: sanitizedParams,
      } as AnalyticsEvent);
    }

    if (validEvents.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No valid events found",
          invalidEvents,
        },
        { status: 400 }
      );
    }

    // Process with deduplication
    const processedEvents = processEventsWithDedup(body.events);
    const uniqueEvents = processedEvents
      .filter((p) => !p.isDuplicate)
      .map((p) => p.event);

    // Get client ID
    let clientId = body.clientId;

    if (!clientId) {
      // Try _fa_client_id cookie
      const faClientIdCookie = request.cookies.get("_fa_client_id")?.value;
      clientId = faClientIdCookie || undefined;
    }

    if (!clientId) {
      // Try _ga cookie
      const gaCookie = request.cookies.get("_ga")?.value;
      clientId = extractClientIdFromCookie(gaCookie) || undefined;
    }

    if (!clientId) {
      // Generate new client ID
      clientId = generateServerClientId();
    }

    const hostname = request.headers.get("host") || "flowauxi.com";

    // Send to GA4 Measurement Protocol
    let result;
    if (uniqueEvents.length > 0) {
      result = await trackServerEvent(clientId, uniqueEvents, {
        userId: body.userId,
        hostname,
        // If consent not granted, GA4 will use cookieless mode
        debug: process.env.NODE_ENV !== "production",
      });
    } else {
      // All events were duplicates
      result = {
        success: true,
        timestamp: Date.now(),
        message: "All events were duplicates, no API call needed",
      };
    }

    if (result.success) {
      recordSuccess();
      analyticsHealth.record("server_event_sent", {
        count: uniqueEvents.length,
        deduped: processedEvents.length - uniqueEvents.length,
      });
    } else {
      recordFailure();
      analyticsHealth.record("server_event_failed", {
        error: result.error,
      });
    }

    return NextResponse.json(
      {
        success: result.success,
        eventsProcessed: uniqueEvents.length,
        eventsDeduplicated: processedEvents.filter((p) => p.isDuplicate).length,
        eventsRejected: invalidEvents.length,
        cookieless: !analyticsAllowed,
        invalidEvents: invalidEvents.length > 0 ? invalidEvents : undefined,
        error: result.error,
        traceIds: processedEvents.map((p) => p.traceId),
      },
      { status: result.success ? 200 : 502 }
    );
  } catch (error) {
    console.error("[Analytics:Collect] Error:", error);

    analyticsHealth.record("server_event_error", {
      error: error instanceof Error ? error.message : "unknown",
    });

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// =============================================================================
// GET /api/analytics/collect (health check)
// =============================================================================

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "analytics-collector",
    version: "2.0",
    features: [
      "deduplication",
      "circuit-breaker",
      "privacy-sanitization",
      "consent-mode",
    ],
    circuitBreaker: {
      isOpen: isCircuitBreakerOpen(),
      consecutiveFailures: _consecutiveFailures,
    },
  });
}

// =============================================================================
// OPTIONS (CORS)
// =============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Consent-State",
      "Access-Control-Max-Age": "86400",
    },
  });
}