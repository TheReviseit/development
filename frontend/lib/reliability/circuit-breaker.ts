/**
 * Circuit Breaker Pattern
 * ========================
 * Prevents cascading failures when external services (Razorpay) are down
 * Based on Netflix Hystrix pattern
 */

import { logger } from "../observability/observability";

// =============================================================================
// CIRCUIT BREAKER CONFIGURATION
// =============================================================================

interface CircuitBreakerConfig {
  failureThreshold: number; // Open circuit after N consecutive failures
  resetTimeout: number; // Try again after N milliseconds
  monitoringWindow: number; // Track failures in last N milliseconds
}

enum CircuitState {
  CLOSED = "CLOSED", // Normal operation
  OPEN = "OPEN", // Failed, reject immediately
  HALF_OPEN = "HALF_OPEN", // Testing if service recovered
}

// =============================================================================
// CIRCUIT BREAKER CLASS
// =============================================================================

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private lastSuccessTime: number = 0;
  private config: CircuitBreakerConfig;
  private serviceName: string;

  constructor(serviceName: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.serviceName = serviceName;
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      resetTimeout: config.resetTimeout || 60000, // 1 minute
      monitoringWindow: config.monitoringWindow || 120000, // 2 minutes
    };
  }

  /**
   * Execute function with circuit breaker protection
   *
   * @param fn - Function to execute
   * @param fallback - Fallback value/function if circuit is open
   * @returns Result of fn or fallback
   */
  async execute<T>(fn: () => Promise<T>, fallback: (() => T) | T): Promise<T> {
    // If circuit is open, return fallback immediately
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        logger.info("circuit_breaker.half_open", {
          service: this.serviceName,
          lastFailureTime: this.lastFailureTime,
        });
      } else {
        logger.warn("circuit_breaker.rejected", {
          service: this.serviceName,
          state: this.state,
          failures: this.failures,
          timeSinceLastFailure: Date.now() - this.lastFailureTime,
        });

        return typeof fallback === "function"
          ? (fallback as () => T)()
          : fallback;
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failures = 0;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED;
      logger.info("circuit_breaker.closed", {
        service: this.serviceName,
        message: "Service recovered",
      });
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    logger.warn("circuit_breaker.failure_recorded", {
      service: this.serviceName,
      failures: this.failures,
      threshold: this.config.failureThreshold,
      state: this.state,
    });

    if (this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      logger.error(
        "circuit_breaker.opened",
        new Error(`Circuit opened for ${this.serviceName}`),
        {
          service: this.serviceName,
          failures: this.failures,
          threshold: this.config.failureThreshold,
        },
      );
    }
  }

  /**
   * Check if enough time has passed to attempt reset
   */
  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.resetTimeout;
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit health metrics
   */
  getMetrics(): {
    state: CircuitState;
    failures: number;
    lastFailureTime: number;
    lastSuccessTime: number;
    threshold: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      threshold: this.config.failureThreshold,
    };
  }

  /**
   * Manually reset circuit (for testing or admin control)
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    logger.info("circuit_breaker.manual_reset", {
      service: this.serviceName,
    });
  }
}

// =============================================================================
// PRE-CONFIGURED CIRCUIT BREAKERS
// =============================================================================

/**
 * Circuit breaker for Razorpay API calls
 */
export const razorpayCircuitBreaker = new CircuitBreaker("razorpay", {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  monitoringWindow: 120000, // 2 minutes
});

/**
 * Circuit breaker for backend API calls
 */
export const backendCircuitBreaker = new CircuitBreaker("backend-api", {
  failureThreshold: 3,
  resetTimeout: 30000, // 30 seconds
  monitoringWindow: 60000, // 1 minute
});

// =============================================================================
// EXPORTS
// =============================================================================

export { CircuitState };
export type { CircuitBreakerConfig };
