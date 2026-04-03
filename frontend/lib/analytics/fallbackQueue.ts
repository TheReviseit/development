/**
 * Analytics Fallback Queue
 * ========================
 *
 * FAANG-level resilient event queue for when client-side analytics is blocked.
 *
 * Features:
 *   - Ad-blocker detection and bypass
 *   - requestIdleCallback + setTimeout fallback (non-blocking)
 *   - Batch sending (max 25 events per request - GA4 MP limit)
 *   - Exponential backoff on failures
 *   - Three-state circuit breaker (closed/open/half-open)
 *   - De-duplication via timestamp_micros + trace_id
 *   - localStorage persistence with size limit
 *
 * Circuit Breaker States:
 *   - CLOSED: Normal operation, requests go through
 *   - OPEN: Too many failures, reject requests, try again after timeout
 *   - HALF_OPEN: Test if service recovered, allow limited requests
 *
 * Architecture:
 *   Event → Check gtag health → if blocked → Queue → Drain to /api/analytics/collect
 */

import { isDebugMode } from "./config";
import { getClientId, getConsentVersion } from "./clientId";

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_QUEUE_SIZE = 100;
const MAX_BATCH_SIZE = 25;
const MAX_RETRIES = 3;
const BACKOFF_DELAYS = [1000, 2000, 4000, 8000]; // Exponential: 1s, 2s, 4s, 8s
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_DURATION = 60_000; // 60 seconds
const STORAGE_KEY = "_fa_analytics_queue";
const DRAIN_DELAY = 1000; // Delay before first drain attempt

// =============================================================================
// TYPES
// =============================================================================

export interface QueuedEvent {
  id: string;
  name: string;
  params: Record<string, unknown>;
  timestamp: number;
  timestamp_micros: number;
  trace_id: string;
  retries: number;
  client_id?: string;
  consent_version?: number;
}

/**
 * Three-state circuit breaker enum
 */
export enum CircuitBreakerState {
  CLOSED = "closed",    // Normal operation
  OPEN = "open",        // Failing, reject requests
  HALF_OPEN = "half-open"  // Testing if service recovered
}

/** Circuit breaker state with timestamps */
interface CircuitBreaker {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailureTime: number;
  openUntil: number;
}

// =============================================================================
// STATE
// =============================================================================

let _queue: QueuedEvent[] = [];
let _circuitBreaker: CircuitBreaker = {
  state: CircuitBreakerState.CLOSED,
  failures: 0,
  successes: 0,
  lastFailureTime: 0,
  openUntil: 0,
};
let _draining: boolean = false;
let _initialized: boolean = false;

// =============================================================================
// UTILITIES
// =============================================================================

function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function getTimestampMicros(): number {
  return Date.now() * 1000;
}

function loadQueueFromStorage(): void {
  if (typeof localStorage === "undefined") return;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      _queue = JSON.parse(stored);

      if (isDebugMode()) {
        console.log(
          "%c[Analytics:FallbackQueue] Loaded queue from storage",
          "color: #10B981;",
          { count: _queue.length }
        );
      }
    }
  } catch (error) {
    console.warn("[Analytics:FallbackQueue] Failed to load queue:", error);
    _queue = [];
  }
}

function saveQueueToStorage(): void {
  if (typeof localStorage === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_queue));
  } catch (error) {
    console.warn("[Analytics:FallbackQueue] Failed to save queue:", error);
  }
}

// =============================================================================
// THREE-STATE CIRCUIT BREAKER
// =============================================================================

/**
 * Check if circuit breaker allows requests
 * Returns true if requests should be allowed
 */
function isCircuitBreakerAllowingRequests(): boolean {
  const now = Date.now();
  
  switch (_circuitBreaker.state) {
    case CircuitBreakerState.CLOSED:
      // Normal operation - allow requests
      return true;
      
    case CircuitBreakerState.OPEN:
      // Check if timeout has passed to transition to half-open
      if (now >= _circuitBreaker.openUntil) {
        _circuitBreaker.state = CircuitBreakerState.HALF_OPEN;
        _circuitBreaker.successes = 0;
        
        if (isDebugMode()) {
          console.log(
            "%c[Analytics:FallbackQueue] Circuit breaker: OPEN → HALF_OPEN",
            "color: #F59E0B; font-weight: bold;"
          );
        }
        return true; // Allow one request to test
      }
      // Still open - reject requests
      return false;
      
    case CircuitBreakerState.HALF_OPEN:
      // Allow limited requests in half-open state
      return true;
  }
}

/**
 * Record a successful request - transitions circuit breaker toward closed
 */
function recordCircuitBreakerSuccess(): void {
  if (_circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
    _circuitBreaker.successes += 1;
    
    // 1 successful request in half-open transitions to closed
    if (_circuitBreaker.successes >= 1) {
      _circuitBreaker.state = CircuitBreakerState.CLOSED;
      _circuitBreaker.failures = 0;
      _circuitBreaker.openUntil = 0;
      
      if (isDebugMode()) {
        console.log(
          "%c[Analytics:FallbackQueue] Circuit breaker: HALF_OPEN → CLOSED",
          "color: #10B981; font-weight: bold;"
        );
      }
    }
  }
}

/**
 * Record a failed request - transitions circuit breaker toward open
 */
function recordCircuitBreakerFailure(): void {
  _circuitBreaker.failures += 1;
  _circuitBreaker.lastFailureTime = Date.now();
  
  if (_circuitBreaker.state === CircuitBreakerState.HALF_OPEN) {
    // Any failure in half-open immediately opens
    _circuitBreaker.state = CircuitBreakerState.OPEN;
    _circuitBreaker.openUntil = Date.now() + CIRCUIT_BREAKER_DURATION;
    
    if (isDebugMode()) {
      console.log(
        "%c[Analytics:FallbackQueue] Circuit breaker: HALF_OPEN → OPEN",
        "color: #EF4444; font-weight: bold;"
      );
    }
  } else if (_circuitBreaker.state === CircuitBreakerState.CLOSED) {
    // Track failures in closed state
    if (_circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      _circuitBreaker.state = CircuitBreakerState.OPEN;
      _circuitBreaker.openUntil = Date.now() + CIRCUIT_BREAKER_DURATION;
      
      if (isDebugMode()) {
        console.warn(
          "%c[Analytics:FallbackQueue] Circuit breaker: CLOSED → OPEN",
          "color: #EF4444; font-weight: bold;",
          { openUntil: new Date(_circuitBreaker.openUntil).toISOString() }
        );
      }
    }
  }
}

/**
 * Get current circuit breaker state for debugging
 */
export function getCircuitBreakerState(): CircuitBreaker {
  return { ..._circuitBreaker };
}

/**
 * Reset circuit breaker to closed state
 */
function resetCircuitBreaker(): void {
  _circuitBreaker = {
    state: CircuitBreakerState.CLOSED,
    failures: 0,
    successes: 0,
    lastFailureTime: 0,
    openUntil: 0,
  };
}

// =============================================================================
// QUEUE OPERATIONS
// =============================================================================

/**
 * Initialize the fallback queue.
 * Loads queue from localStorage.
 */
export function initializeFallbackQueue(): void {
  if (typeof window === "undefined" || _initialized) return;

  loadQueueFromStorage();
  _initialized = true;

  if (isDebugMode()) {
    console.log(
      "%c[Analytics:FallbackQueue] Initialized",
      "color: #10B981; font-weight: bold;",
      { queueSize: _queue.length }
    );
  }
}

/**
 * Add an event to the fallback queue.
 * Called when gtag is blocked.
 */
export function enqueueEvent(
  name: string,
  params: Record<string, unknown>
): boolean {
  if (typeof window === "undefined") return false;

  if (_queue.length >= MAX_QUEUE_SIZE) {
    _queue.shift();

    if (isDebugMode()) {
      console.warn(
        "%c[Analytics:FallbackQueue] Queue full, dropped oldest event",
        "color: #F59E0B;"
      );
    }
  }

  const event: QueuedEvent = {
    id: generateTraceId(),
    name,
    params,
    timestamp: Date.now(),
    timestamp_micros: getTimestampMicros(),
    trace_id: generateTraceId(),
    retries: 0,
    client_id: getClientId() || undefined,
    consent_version: getConsentVersion(),
  };

  _queue.push(event);
  saveQueueToStorage();

  if (isDebugMode()) {
    console.log(
      "%c[Analytics:FallbackQueue] Event queued",
      "color: #3B82F6;",
      { name, queueSize: _queue.length }
    );
  }

  return true;
}

/**
 * Get the current queue size.
 */
export function getQueueSize(): number {
  return _queue.length;
}

/**
 * Check if queue has events.
 */
export function hasQueuedEvents(): boolean {
  return _queue.length > 0;
}

/**
 * Clear the queue entirely.
 * Called when consent is revoked.
 */
export function clearQueue(): void {
  _queue = [];

  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }

  if (isDebugMode()) {
    console.log(
      "%c[Analytics:FallbackQueue] Queue cleared",
      "color: #EF4444;"
    );
  }
}

// =============================================================================
// NETWORK OPERATIONS
// =============================================================================

/**
 * Drain the queue by sending batched events to the server.
 * Uses requestIdleCallback for non-blocking behavior.
 */
export function drainQueue(): void {
  // Check three-state circuit breaker before draining
  if (_draining || !isCircuitBreakerAllowingRequests() || _queue.length === 0) {
    return;
  }

  _draining = true;

  const drainFn = () => {
    // Re-check circuit breaker and queue
    if (_queue.length === 0 || !isCircuitBreakerAllowingRequests()) {
      _draining = false;
      return;
    }

    const batch = _queue.slice(0, MAX_BATCH_SIZE);

    sendBatch(batch)
      .then((success) => {
        if (success) {
          _queue.splice(0, batch.length);
          saveQueueToStorage();
          recordCircuitBreakerSuccess();

          if (isDebugMode()) {
            console.log(
              "%c[Analytics:FallbackQueue] Batch sent successfully",
              "color: #10B981;",
              { sent: batch.length, remaining: _queue.length }
            );
          }
        }
      })
      .catch(() => {
        // Handled in sendBatch
      })
      .finally(() => {
        if (_queue.length > 0) {
          scheduleDrain();
        } else {
          _draining = false;
        }
      });
  };

  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(drainFn, { timeout: DRAIN_DELAY });
  } else {
    setTimeout(drainFn, DRAIN_DELAY);
  }
}

/**
 * Schedule the next drain.
 * Uses requestIdleCallback for non-blocking.
 */
function scheduleDrain(): void {
  const scheduleFn = () => {
    drainQueue();
  };

  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(scheduleFn, { timeout: DRAIN_DELAY });
  } else {
    setTimeout(scheduleFn, DRAIN_DELAY);
  }
}

/**
 * Send a batch of events to the server.
 */
async function sendBatch(
  events: QueuedEvent[]
): Promise<boolean> {
  if (events.length === 0) return true;

  try {
    const response = await fetch("/api/analytics/collect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        events: events.map((e) => ({
          name: e.name,
          params: {
            ...e.params,
            timestamp_micros: e.timestamp_micros,
            trace_id: e.trace_id,
            consent_version: e.consent_version,
          },
        })),
        clientId: getClientId(),
      }),
      keepalive: true,
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        return true;
      }
    }

    recordCircuitBreakerFailure();
    handleBatchFailure(events);
    return false;
  } catch (error) {
    recordCircuitBreakerFailure();
    handleBatchFailure(events);

    if (isDebugMode()) {
      console.warn(
        "%c[Analytics:FallbackQueue] Batch send failed",
        "color: #EF4444;",
        { error: error instanceof Error ? error.message : "Unknown" }
      );
    }

    return false;
  }
}

/**
 * Handle batch failure with exponential backoff.
 */
function handleBatchFailure(events: QueuedEvent[]): void {
  for (const event of events) {
    if (event.retries < MAX_RETRIES) {
      event.retries += 1;

      const delay = BACKOFF_DELAYS[Math.min(event.retries - 1, BACKOFF_DELAYS.length - 1)];

      setTimeout(() => {
        if (!_draining) {
          drainQueue();
        }
      }, delay);
    } else {
      _queue = _queue.filter((e) => e.id !== event.id);

      if (isDebugMode()) {
        console.warn(
          "%c[Analytics:FallbackQueue] Event dropped after max retries",
          "color: #EF4444;",
          { eventId: event.id, name: event.name }
        );
      }
    }
  }

  saveQueueToStorage();
}

// =============================================================================
// WINDOW EXPOSURE
// =============================================================================

declare global {
  interface Window {
    __flowauxi_fallback_queue_size: number;
    __flowauxi_fallback_drain: () => void;
    __flowauxi_fallback_clear: () => void;
  }
}

if (typeof window !== "undefined") {
  window.__flowauxi_fallback_queue_size = 0;
  window.__flowauxi_fallback_drain = drainQueue;
  window.__flowauxi_fallback_clear = clearQueue;
}
