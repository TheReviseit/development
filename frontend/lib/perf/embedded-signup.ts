/**
 * Server-side performance helpers for WhatsApp embedded signup route.
 */

export const EMBEDDED_SIGNUP_CORRELATION_HEADER = "X-Correlation-ID";

export const EMBEDDED_SIGNUP_BUDGETS_MS = {
  auth: 150,
  token_exchange: 800,
  meta_fanout: 1200,
  conflict_check: 350,
  db_finalize: 350,
  webhook_enqueue: 100,
  total: 2500,
} as const;

export type EmbeddedSignupPhase =
  | "auth"
  | "token_exchange"
  | "meta_fanout"
  | "conflict_check"
  | "db_finalize"
  | "webhook_enqueue";

export function createEmbeddedSignupCorrelationId(
  existing?: string | null,
): string {
  return existing?.trim() || crypto.randomUUID();
}

export class EmbeddedSignupServerTimer {
  private readonly startedAt = Date.now();
  private readonly phases = new Map<EmbeddedSignupPhase, number>();

  constructor(public readonly correlationId: string) {}

  record(phase: EmbeddedSignupPhase, startedAtMs: number): void {
    this.phases.set(phase, Date.now() - startedAtMs);
  }

  totalMs(): number {
    return Date.now() - this.startedAt;
  }

  phaseEntries(): Array<[EmbeddedSignupPhase, number]> {
    return Array.from(this.phases.entries());
  }

  budgetViolations(): Record<string, number> {
    const violations: Record<string, number> = {};
    const phaseBudgets: Record<EmbeddedSignupPhase, number> = {
      auth: EMBEDDED_SIGNUP_BUDGETS_MS.auth,
      token_exchange: EMBEDDED_SIGNUP_BUDGETS_MS.token_exchange,
      meta_fanout: EMBEDDED_SIGNUP_BUDGETS_MS.meta_fanout,
      conflict_check: EMBEDDED_SIGNUP_BUDGETS_MS.conflict_check,
      db_finalize: EMBEDDED_SIGNUP_BUDGETS_MS.db_finalize,
      webhook_enqueue: EMBEDDED_SIGNUP_BUDGETS_MS.webhook_enqueue,
    };

    for (const [phase, budget] of Object.entries(phaseBudgets)) {
      const actual = this.phases.get(phase as EmbeddedSignupPhase) ?? 0;
      if (actual > budget) violations[phase] = actual;
    }

    if (this.totalMs() > EMBEDDED_SIGNUP_BUDGETS_MS.total) {
      violations.total = this.totalMs();
    }
    return violations;
  }
}

export function buildEmbeddedSignupServerTimingHeader(
  timer: EmbeddedSignupServerTimer,
): string {
  const parts: string[] = [];
  for (const [phase, ms] of timer.phaseEntries()) {
    parts.push(`${phase};dur=${ms}`);
  }
  parts.push(`total;dur=${timer.totalMs()}`);
  return parts.join(", ");
}

export function logEmbeddedSignupTiming(
  timer: EmbeddedSignupServerTimer,
  extra: Record<string, unknown> = {},
): void {
  const payload = {
    event: "embedded_signup_timing",
    correlation_id: timer.correlationId,
    total_ms: timer.totalMs(),
    phases_ms: Object.fromEntries(timer.phaseEntries()),
    ...extra,
  };
  const violations = timer.budgetViolations();
  if (Object.keys(violations).length > 0) {
    console.warn("[embedded-signup] slow request", {
      ...payload,
      budget_violations: violations,
    });
  } else {
    console.log("[embedded-signup] timing", payload);
  }
}

export function attachEmbeddedSignupPerfHeaders(
  response: Response,
  timer: EmbeddedSignupServerTimer,
): void {
  response.headers.set(
    EMBEDDED_SIGNUP_CORRELATION_HEADER,
    timer.correlationId,
  );
  response.headers.set(
    "Server-Timing",
    buildEmbeddedSignupServerTimingHeader(timer),
  );
  response.headers.set("X-Response-Time", `${timer.totalMs().toFixed(2)}ms`);
}

export function jsonWithEmbeddedSignupPerf<T>(
  body: T,
  timer: EmbeddedSignupServerTimer,
  init?: ResponseInit,
): Response {
  logEmbeddedSignupTiming(timer);
  const response = Response.json(body, init);
  attachEmbeddedSignupPerfHeaders(response, timer);
  return response;
}
