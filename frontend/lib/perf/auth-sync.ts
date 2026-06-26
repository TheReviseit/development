export const AUTH_SYNC_CORRELATION_HEADER = "X-Correlation-ID";

export const AUTH_SYNC_BUDGETS_MS = {
  verifyToken: 2000,
  sessionCookie: 2000,
  warmCache: 1500,
  idempotencyClaim: 3000,
  provisionRpc: 3000,
  onboardingFast: 1500,
  idempotencyComplete: 1500,
  sessionCookieCreate: 2000,
  total: 5000,
} as const;

export type AuthSyncPhase =
  | "verify_token"
  | "session_cookie"
  | "warm_cache"
  | "idempotency_claim"
  | "provision_rpc"
  | "onboarding_fast"
  | "idempotency_complete"
  | "session_cookie_create"
  | "total";

export function createAuthSyncCorrelationId(existing?: string | null): string {
  return existing?.trim() || crypto.randomUUID();
}

export class AuthSyncServerTimer {
  private readonly startedAt = Date.now();
  private readonly phases = new Map<AuthSyncPhase, number>();

  constructor(public readonly correlationId: string) {}

  record(phase: Exclude<AuthSyncPhase, "total">, startedAtMs: number): void {
    this.phases.set(phase, Date.now() - startedAtMs);
  }

  totalMs(): number {
    return Date.now() - this.startedAt;
  }

  buildServerTimingHeader(): string {
    const parts: string[] = [];
    for (const [phase, ms] of this.phases.entries()) {
      parts.push(`${phase};dur=${ms.toFixed(1)}`);
    }
    parts.push(`total;dur=${this.totalMs().toFixed(1)}`);
    return parts.join(", ");
  }

  structuredLog(extra?: Record<string, unknown>): Record<string, unknown> {
    return {
      correlationId: this.correlationId,
      totalMs: this.totalMs(),
      phases: Object.fromEntries(this.phases.entries()),
      ...extra,
    };
  }
}

export function attachAuthSyncHeaders(
  response: Response,
  timer: AuthSyncServerTimer,
): Response {
  response.headers.set("Server-Timing", timer.buildServerTimingHeader());
  response.headers.set(AUTH_SYNC_CORRELATION_HEADER, timer.correlationId);
  return response;
}

export function isAbortOrTimeoutError(error: unknown): boolean {
  const msg = String((error as Error)?.message || error);
  return (
    msg.includes("AbortError") ||
    msg.includes("aborted") ||
    msg.includes("timeout") ||
    msg.includes("TIMEOUT")
  );
}

export function isAuthSyncWarmCacheEnabled(): boolean {
  return process.env.AUTH_SYNC_WARM_CACHE_ENABLED !== "false";
}
