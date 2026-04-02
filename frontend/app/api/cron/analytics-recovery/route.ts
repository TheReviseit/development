/**
 * Analytics Recovery Cron Endpoint
 * =================================
 *
 * Background job for processing failed analytics events.
 * Runs every 5 minutes to retry failed critical events.
 *
 * Endpoint: GET /api/cron/analytics-recovery
 */

import { NextRequest, NextResponse } from "next/server";
import { runRecoveryCron, getRecoveryStats } from "@/lib/analytics/recovery";

// =============================================================================
// CRON AUTHENTICATION
// =============================================================================

/**
 * Verify cron request is authorized.
 * In production, check for cron secret header or verify via other means.
 */
function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    console.warn("[Cron] No CRON_SECRET configured - allowing request (dev only)");
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("x-cron-secret");
  return authHeader === cronSecret;
}

// =============================================================================
// GET /api/cron/analytics-recovery
// =============================================================================

export async function GET(request: NextRequest) {
  // Check authorization
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Run recovery process
    const result = await runRecoveryCron();

    // Get current stats
    const stats = getRecoveryStats();

    return NextResponse.json({
      status: "success",
      timestamp: new Date().toISOString(),
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      queueStats: stats,
    });
  } catch (error) {
    console.error("[Cron:AnalyticsRecovery] Error:", error);

    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST /api/cron/analytics-recovery (manual trigger)
// =============================================================================

export async function POST(request: NextRequest) {
  // Check authorization
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, eventId } = body;

    if (action === "replay" && eventId) {
      // Manual replay specific event
      const { replayEvent } = await import("@/lib/analytics/recovery");
      const result = await replayEvent(eventId);

      return NextResponse.json({
        status: result.success ? "success" : "error",
        action: "replay",
        eventId,
        error: result.error,
      });
    }

    if (action === "replay-all") {
      // Replay all failed events
      const { replayAllFailed } = await import("@/lib/analytics/recovery");
      const result = await replayAllFailed();

      return NextResponse.json({
        status: "success",
        action: "replay-all",
        triggered: result.triggered,
        ids: result.ids,
      });
    }

    if (action === "stats") {
      // Get queue stats
      const stats = getRecoveryStats();
      return NextResponse.json({ status: "success", stats });
    }

    return NextResponse.json(
      { error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Cron:AnalyticsRecovery] Error:", error);

    return NextResponse.json(
      { status: "error", error: "Internal server error" },
      { status: 500 }
    );
  }
}