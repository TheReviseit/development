/**
 * Server-Side Analytics Collection Endpoint
 * ===========================================
 *
 * FAANG-Level server-side analytics collection with circuit breaker.
 *
 * Receives analytics events from the client as a fallback when
 * client-side tracking is blocked (ad blockers), and forwards them
 * to GA4 via the Measurement Protocol.
 *
 * Features:
 *   - Circuit breaker (pause after 5 consecutive failures)
 *   - Privacy-compliant (anonymized data, no raw IP logging)
 *   - Custom client ID support (_fa_client_id)
 *   - Event schema validation
 *
 * Endpoint: POST /api/analytics/collect
 *
 * @see lib/analytics/server.ts for the Measurement Protocol implementation
 */

import { NextRequest, NextResponse } from "next/server";
import {
  trackServerEvent,
  extractClientIdFromCookie,
  generateServerClientId,
} from "@/lib/analytics/server";
import type { AnalyticsEvent } from "@/lib/analytics/events";
import { isValidEventName } from "@/lib/analytics/events";

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_EVENTS_PER_REQUEST = 25;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_DURATION = 60_000;

// =============================================================================
// CIRCUIT BREAKER STATE (in-memory)
// =============================================================================

let _consecutiveFailures = 0;
let _circuitOpenUntil = 0;

// =============================================================================
// REQUEST TYPES
// =============================================================================

interface CollectRequestBody {
  events: Array<{
    name: string;
    params: Record<string, unknown>;
  }>;
  userId?: string;
  clientId?: string;
}

// =============================================================================
// UTILITIES
// =============================================================================

function isCircuitBreakerOpen(): boolean {
  if (_consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    if (Date.now() < _circuitOpenUntil) {
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

// =============================================================================
// POST /api/analytics/collect
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    if (isCircuitBreakerOpen()) {
      return NextResponse.json(
        { error: "Service temporarily unavailable (circuit breaker open)" },
        { status: 503 }
      );
    }

    const body: CollectRequestBody = await request.json();

    if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json(
        { error: "events array is required and must not be empty" },
        { status: 400 }
      );
    }

    if (body.events.length > MAX_EVENTS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_EVENTS_PER_REQUEST} events per request` },
        { status: 400 }
      );
    }

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

      validEvents.push({
        name: event.name,
        params: event.params || {},
      } as AnalyticsEvent);
    }

    if (validEvents.length === 0) {
      return NextResponse.json(
        {
          error: "No valid events found",
          invalidEvents,
        },
        { status: 400 }
      );
    }

    let clientId = body.clientId;

    if (!clientId) {
      const faClientIdCookie = request.cookies.get("_fa_client_id")?.value;
      clientId = faClientIdCookie || undefined;
    }

    if (!clientId) {
      const gaCookie = request.cookies.get("_ga")?.value;
      clientId = extractClientIdFromCookie(gaCookie) || undefined;
    }

    if (!clientId) {
      clientId = generateServerClientId();
    }

    const hostname = request.headers.get("host") || "flowauxi.com";

    const result = await trackServerEvent(clientId, validEvents, {
      userId: body.userId,
      hostname,
    });

    if (result.success) {
      recordSuccess();
    } else {
      recordFailure();
    }

    return NextResponse.json(
      {
        success: result.success,
        eventsProcessed: validEvents.length,
        eventsRejected: invalidEvents.length,
        invalidEvents: invalidEvents.length > 0 ? invalidEvents : undefined,
        error: result.error,
      },
      { status: result.success ? 200 : 502 }
    );
  } catch (error) {
    console.error("[Analytics:Collect] Error processing request:", error);

    return NextResponse.json(
      {
        error: "Internal server error processing analytics events",
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// OPTIONS (CORS preflight)
// =============================================================================

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
