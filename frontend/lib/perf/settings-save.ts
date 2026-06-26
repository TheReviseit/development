/**
 * Server-side performance helpers for AI Settings save proxy route.
 */

export const SETTINGS_SAVE_CORRELATION_HEADER = "X-Correlation-ID";

export const SETTINGS_SAVE_BUDGETS_MS = {
  auth: 15,
  parseBody: 5,
  proxyFetch: 60,
  cacheInvalidate: 15,
  total: 200,
} as const;

export type SettingsSavePhase =
  | "auth"
  | "parse_body"
  | "proxy_fetch"
  | "parse_response"
  | "cache_invalidate";

export function createCorrelationId(): string {
  return crypto.randomUUID();
}

export function createSaveCorrelationId(existing?: string | null): string {
  return existing?.trim() || createCorrelationId();
}

export class SettingsSaveServerTimer {
  private readonly startedAt = Date.now();
  private readonly phases = new Map<SettingsSavePhase, number>();

  constructor(public readonly correlationId: string) {}

  record(phase: SettingsSavePhase, startedAtMs: number): void {
    this.phases.set(phase, Date.now() - startedAtMs);
  }

  totalMs(): number {
    return Date.now() - this.startedAt;
  }

  phaseEntries(): Array<[SettingsSavePhase, number]> {
    return Array.from(this.phases.entries());
  }

  budgetViolations(): Record<string, number> {
    const violations: Record<string, number> = {};
    const phaseBudgets: Record<SettingsSavePhase, number> = {
      auth: SETTINGS_SAVE_BUDGETS_MS.auth,
      parse_body: SETTINGS_SAVE_BUDGETS_MS.parseBody,
      proxy_fetch: SETTINGS_SAVE_BUDGETS_MS.proxyFetch,
      parse_response: 10,
      cache_invalidate: SETTINGS_SAVE_BUDGETS_MS.cacheInvalidate,
    };

    for (const [phase, budget] of Object.entries(phaseBudgets)) {
      const actual = this.phases.get(phase as SettingsSavePhase) ?? 0;
      if (actual > budget) violations[phase] = actual;
    }

    if (this.totalMs() > SETTINGS_SAVE_BUDGETS_MS.total) {
      violations.total = this.totalMs();
    }
    return violations;
  }
}

export function buildServerTimingHeader(
  timer: SettingsSaveServerTimer,
  upstreamTiming?: string | null,
): string {
  const parts: string[] = [];
  for (const [phase, ms] of timer.phaseEntries()) {
    parts.push(`${phase};dur=${ms}`);
  }
  parts.push(`next_total;dur=${timer.totalMs()}`);
  if (upstreamTiming) {
    parts.push(upstreamTiming);
  }
  return parts.join(", ");
}

export function logSettingsSaveTiming(
  timer: SettingsSaveServerTimer,
  extra: Record<string, unknown> = {},
): void {
  const payload = {
    event: "ai_settings_save_proxy_timing",
    correlation_id: timer.correlationId,
    total_ms: timer.totalMs(),
    phases_ms: Object.fromEntries(timer.phaseEntries()),
    ...extra,
  };
  const violations = timer.budgetViolations();
  if (Object.keys(violations).length > 0) {
    console.warn("[business/save] slow save", { ...payload, budget_violations: violations });
  } else {
    console.log("[business/save] timing", payload);
  }
}

export function attachSavePerfHeaders(
  response: Response,
  timer: SettingsSaveServerTimer,
  upstreamTiming?: string | null,
): void {
  response.headers.set(
    SETTINGS_SAVE_CORRELATION_HEADER,
    timer.correlationId,
  );
  response.headers.set(
    "Server-Timing",
    buildServerTimingHeader(timer, upstreamTiming),
  );
  response.headers.set("X-Response-Time", `${timer.totalMs().toFixed(2)}ms`);
}
