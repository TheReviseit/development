/**
 * Server-Side Circuit Breaker — threshold from runtime flags / env.
 */

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

function readThreshold(): number {
  const fromEnv = parseInt(process.env.BILLING_CB_THRESHOLD || "10", 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 10;
}

function countTimeoutAsFailure(): boolean {
  return process.env.BILLING_CB_COUNT_TIMEOUT_AS_FAILURE === "true";
}

class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failures = 0;
  private lastFailureTime = 0;
  private threshold: number;
  private readonly resetMs: number;

  constructor(threshold?: number, resetMs = parseInt(process.env.CIRCUIT_BREAKER_RESET_MS || "15000", 10)) {
    this.threshold = threshold ?? readThreshold();
    this.resetMs = resetMs;
  }

  setThreshold(value: number): void {
    if (value > 0) {
      this.threshold = value;
    }
  }

  isOpen(): boolean {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetMs) {
        this.state = "HALF_OPEN";
        console.log(`[CircuitBreaker] billing → HALF_OPEN`);
      }
    }
    return this.state === "OPEN";
  }

  recordSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      this.failures = 0;
      console.log(`[CircuitBreaker] billing → CLOSED (recovered)`);
    } else {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  recordFailure(statusCode?: number): void {
    if (statusCode === 504 && !countTimeoutAsFailure()) {
      return;
    }
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold) {
      this.state = "OPEN";
      console.error(`[CircuitBreaker] billing → OPEN (${this.failures}/${this.threshold})`);
    }
  }
}

export const cb = new CircuitBreaker();

export function configureCircuitBreakerFromFlags(flags: Record<string, unknown>): void {
  const threshold = Number(flags.cb_threshold);
  if (Number.isFinite(threshold) && threshold > 0) {
    cb.setThreshold(threshold);
  }
}

export { countTimeoutAsFailure };
