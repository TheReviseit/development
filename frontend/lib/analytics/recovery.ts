/**
 * Event Replay & Recovery System - FAANG Level
 * =============================================
 *
 * Production-grade event persistence and recovery for critical events.
 *
 * Problem:
 *   - Server goes down during event send
 *   - Events fail after all retries
 *   - Network issues cause data loss
 *   - Need to replay failed events
 *
 * Solution:
 *   - Critical events (purchases, signups) persisted to durable storage
 *   - Background job retries failed events
 *   - Manual replay capability for ops team
 *   - Audit trail for all replay actions
 *
 * Architecture:
 *   Event Created
 *       │
 *       ▼
 *   ┌───────────────┐
 *   │ Critical?     │ ◄── Purchase, signup, payment_success
 *   │ (yes/no)      │
 *   └───────┬───────┘
 *           │
 *      ┌────┴────┐
 *      ▼         ▼
 *    YES        NO
 *      │         │
 *      ▼         ▼
 *   Persist    Drop
 *   to queue   (non-critical)
 *      │
 *      ▼
 *   ┌─────────────────────┐
 *   │   Recovery Queue    │
│   │  (PostgreSQL/Redis)  │
│   └──────────┬──────────┘
│              │
│              ▼
│   ┌─────────────────────┐
│   │ Background Worker    │ ◄── Runs every 5 min
│   │ (cron/retry)        │
│   └──────────┬──────────┘
│              │
│      ┌───────┴───────┐
│      ▼               ▼
│   Success         Retry
│      │               │
│      ▼               ▼
│   Delete      Mark retry
│   from queue  + increment
│              │
│              ▼
│         Max retries
│         reached?
│              │
│      ┌───────┴───────┐
│      ▼               ▼
│    YES              NO
│      │               │
│      ▼               ▼
│   Alert ops      Try again
│   + quarantine  (next run)
│              │
│              ▼
│   Manual replay
│   (if needed)
│
 */

import { isDebugMode } from "./config";
import { analyticsHealth } from "./health";

// =============================================================================
// CONFIGURATION
// =============================================================================

const RECOVERY_CONFIG = {
  maxRetries: 5,
  retryDelayMs: 60_000, // 1 minute
  cleanupAfterDays: 7,
  criticalEvents: ["purchase", "subscription_activated", "payment_success", "signup"],
  batchSize: 50,
} as const;

// =============================================================================
// TYPES
// =============================================================================

export type EventStatus = "pending" | "processing" | "success" | "failed" | "quarantined";

export interface RecoveryEvent {
  id: string;
  event_name: string;
  params: Record<string, unknown>;
  client_id: string;
  user_id?: string;
  hostname: string;
  trace_id: string;
  created_at: number;
  updated_at: number;
  retry_count: number;
  status: EventStatus;
  last_error?: string;
  priority: "high" | "medium" | "low";
}

// =============================================================================
// IN-MEMORY STORAGE (for demo - use Redis/Postgres in production)
// =============================================================================

class RecoveryStore {
  private events: Map<string, RecoveryEvent> = new Map();

  /**
   * Add event to recovery queue.
   */
  add(event: Omit<RecoveryEvent, "id" | "created_at" | "updated_at" | "retry_count" | "status">): string {
    const id = generateEventId();
    const now = Date.now();

    const recoveryEvent: RecoveryEvent = {
      ...event,
      id,
      created_at: now,
      updated_at: now,
      retry_count: 0,
      status: "pending",
    };

    this.events.set(id, recoveryEvent);

    analyticsHealth.record("recovery_event_queued", {
      event: event.event_name,
      priority: event.priority,
    });

    if (isDebugMode()) {
      console.log(
        `%c[Recovery] Queued: ${event.event_name}`,
        "color: #8B5CF6;",
        { id, traceId: event.trace_id }
      );
    }

    return id;
  }

  /**
   * Get pending events for retry.
   */
  getPending(limit: number = RECOVERY_CONFIG.batchSize): RecoveryEvent[] {
    const pending: RecoveryEvent[] = [];

    for (const event of this.events.values()) {
      if (event.status === "pending" && event.retry_count < RECOVERY_CONFIG.maxRetries) {
        pending.push(event);
        if (pending.length >= limit) break;
      }
    }

    return pending;
  }

  /**
   * Get event by ID.
   */
  get(id: string): RecoveryEvent | undefined {
    return this.events.get(id);
  }

  /**
   * Update event status.
   */
  updateStatus(id: string, status: EventStatus, error?: string): void {
    const event = this.events.get(id);
    if (!event) return;

    event.status = status;
    event.updated_at = Date.now();

    if (error) {
      event.last_error = error;
    }

    if (status === "processing") {
      event.retry_count += 1;
    }
  }

  /**
   * Get all events (for admin UI).
   */
  getAll(filter?: { status?: EventStatus; eventName?: string }): RecoveryEvent[] {
    let all = Array.from(this.events.values());

    if (filter?.status) {
      all = all.filter((e) => e.status === filter.status);
    }

    if (filter?.eventName) {
      all = all.filter((e) => e.event_name === filter.eventName);
    }

    return all.sort((a, b) => b.created_at - a.created_at);
  }

  /**
   * Get statistics.
   */
  getStats(): RecoveryStats {
    const events = Array.from(this.events.values());

    return {
      total: events.length,
      pending: events.filter((e) => e.status === "pending").length,
      processing: events.filter((e) => e.status === "processing").length,
      success: events.filter((e) => e.status === "success").length,
      failed: events.filter((e) => e.status === "failed").length,
      quarantined: events.filter((e) => e.status === "quarantined").length,
    };
  }

  /**
   * Delete old successful events.
   */
  cleanup(): number {
    const now = Date.now();
    const cutoff = now - RECOVERY_CONFIG.cleanupAfterDays * 24 * 60 * 60 * 1000;
    let cleaned = 0;

    for (const [id, event] of this.events.entries()) {
      if (event.status === "success" && event.updated_at < cutoff) {
        this.events.delete(id);
        cleaned++;
      }
    }

    if (isDebugMode() && cleaned > 0) {
      console.log(`%c[Recovery] Cleaned ${cleaned} old events`, "color: #6B7280;");
    }

    return cleaned;
  }

  /**
   * Clear all (for testing).
   */
  clear(): void {
    this.events.clear();
  }
}

interface RecoveryStats {
  total: number;
  pending: number;
  processing: number;
  success: number;
  failed: number;
  quarantined: number;
}

const recoveryStore = new RecoveryStore();

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Queue event for recovery if critical.
 * Returns true if queued, false if not critical.
 */
export function queueForRecovery(
  eventName: string,
  params: Record<string, unknown>,
  options: {
    clientId: string;
    userId?: string;
    hostname: string;
    traceId: string;
    error?: string;
  }
): boolean {
  const isCritical = (RECOVERY_CONFIG.criticalEvents as readonly string[]).includes(eventName);

  if (!isCritical) {
    if (isDebugMode()) {
      console.log(
        `%c[Recovery] Non-critical event, not queuing: ${eventName}`,
        "color: #6B7280;"
      );
    }
    return false;
  }

  const priority: "high" | "medium" | "low" = 
    eventName === "purchase" || eventName === "payment_success" ? "high" : "medium";

  recoveryStore.add({
    event_name: eventName,
    params,
    client_id: options.clientId,
    user_id: options.userId,
    hostname: options.hostname,
    trace_id: options.traceId,
    priority,
    last_error: options.error,
  });

  analyticsHealth.record("recovery_critical_queued", {
    event: eventName,
    priority,
  });

  return true;
}

/**
 * Process all pending recovery events.
 * This would be called by a cron job in production.
 */
export async function processRecoveryQueue(): Promise<ProcessingResult> {
  const pending = recoveryStore.getPending();

  if (pending.length === 0) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const event of pending) {
    // Mark as processing
    recoveryStore.updateStatus(event.id, "processing");

    try {
      // Attempt to send to GA4 Measurement Protocol
      // In production, import and call trackServerEvent
      const result = await attemptSendEvent(event);

      if (result.success) {
        recoveryStore.updateStatus(event.id, "success");
        succeeded++;
        analyticsHealth.record("recovery_event_success", { event: event.event_name });
      } else {
        handleRetryFailure(event, result.error ?? "unknown error");
        failed++;
      }
    } catch (error) {
      handleRetryFailure(event, error instanceof Error ? error.message : "unknown");
      failed++;
    }
  }

  return { processed: pending.length, succeeded, failed };
}

/**
 * Attempt to send event to GA4.
 */
async function attemptSendEvent(event: RecoveryEvent): Promise<{ success: boolean; error?: string }> {
  // In production, this would call trackServerEvent from server.ts
  // For now, simulate the call

  if (isDebugMode()) {
    console.log(
      `%c[Recovery] Attempting: ${event.event_name}`,
      "color: #F59E0B;",
      { retry: event.retry_count + 1, traceId: event.trace_id }
    );
  }

  // Simulate network call
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Simulate success (in production, actual GA4 response)
  return { success: true };
}

/**
 * Handle retry failure.
 */
function handleRetryFailure(event: RecoveryEvent, error: string): void {
  if (event.retry_count >= RECOVERY_CONFIG.maxRetries - 1) {
    // Max retries reached - quarantine
    recoveryStore.updateStatus(event.id, "quarantined", error);
    analyticsHealth.record("recovery_event_quarantined", {
      event: event.event_name,
      reason: "max_retries_reached",
    });

    if (isDebugMode()) {
      console.error(
        `%c[Recovery] Quarantined: ${event.event_name}`,
        "color: #EF4444;",
        { id: event.id, error }
      );
    }
  } else {
    // Mark as pending for next retry
    recoveryStore.updateStatus(event.id, "pending", error);
    analyticsHealth.record("recovery_event_retry", {
      event: event.event_name,
      retryCount: event.retry_count,
    });
  }
}

/**
 * Manual replay - for ops team to trigger specific event.
 */
export async function replayEvent(eventId: string): Promise<{ success: boolean; error?: string }> {
  const event = recoveryStore.get(eventId);

  if (!event) {
    return { success: false, error: "Event not found" };
  }

  if (event.status === "success") {
    return { success: false, error: "Event already processed" };
  }

  recoveryStore.updateStatus(eventId, "processing");

  const result = await attemptSendEvent(event);

  if (result.success) {
    recoveryStore.updateStatus(eventId, "success");
    analyticsHealth.record("recovery_manual_replay_success", { eventId });
  } else {
    recoveryStore.updateStatus(eventId, "pending", result.error);
    analyticsHealth.record("recovery_manual_replay_failed", { eventId, error: result.error });
  }

  return result;
}

/**
 * Bulk replay - for multiple failed events.
 */
export async function replayAllFailed(): Promise<{ triggered: number; ids: string[] }> {
  const failed = recoveryStore.getAll({ status: "failed" });

  const ids: string[] = [];
  for (const event of failed) {
    recoveryStore.updateStatus(event.id, "pending");
    ids.push(event.id);
  }

  return { triggered: ids.length, ids };
}

/**
 * Get recovery queue statistics.
 */
export function getRecoveryStats(): RecoveryStats {
  return recoveryStore.getStats();
}

/**
 * Get all events in recovery queue (for admin).
 */
export function getRecoveryEvents(filter?: { status?: EventStatus; eventName?: string }): RecoveryEvent[] {
  return recoveryStore.getAll(filter);
}

/**
 * Get specific event for debugging.
 */
export function getRecoveryEvent(eventId: string): RecoveryEvent | undefined {
  return recoveryStore.get(eventId);
}

// =============================================================================
// UTILITIES
// =============================================================================

function generateEventId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface ProcessingResult {
  processed: number;
  succeeded: number;
  failed: number;
}

// =============================================================================
// EXPORTS FOR CRON JOB
// =============================================================================

/**
 * Cron handler for background processing.
 * Call this from your cron endpoint (e.g., /api/cron/analytics-recovery)
 */
export async function runRecoveryCron(): Promise<ProcessingResult> {
  if (isDebugMode()) {
    console.log("%c[RecoveryCron] Starting...", "color: #8B5CF6;");
  }

  // Clean up old events first
  recoveryStore.cleanup();

  // Process pending events
  const result = await processRecoveryQueue();

  if (isDebugMode()) {
    console.log(
      "%c[RecoveryCron] Complete",
      "color: #10B981;",
      result
    );
  }

  return result;
}