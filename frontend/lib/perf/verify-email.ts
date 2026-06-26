export const VERIFY_EMAIL_CORRELATION_HEADER = "X-Correlation-ID";

export const VERIFY_EMAIL_BUDGETS_MS = {
  auth: 200,
  supabaseRpc: 50,
  total: 120,
} as const;

export type VerifyEmailPhase = "auth" | "supabase_rpc" | "total";

export function createVerifyCorrelationId(existing?: string | null): string {
  return existing?.trim() || crypto.randomUUID();
}

export class VerifyEmailServerTimer {
  private readonly startedAt = Date.now();
  private readonly phases = new Map<VerifyEmailPhase, number>();

  constructor(public readonly correlationId: string) {}

  record(phase: Exclude<VerifyEmailPhase, "total">, startedAtMs: number): void {
    this.phases.set(phase, Date.now() - startedAtMs);
  }

  totalMs(): number {
    return Date.now() - this.startedAt;
  }

  buildServerTimingHeader(): string {
    const parts: string[] = [];
    const auth = this.phases.get("auth");
    const rpc = this.phases.get("supabase_rpc");
    if (auth != null) parts.push(`auth;dur=${auth.toFixed(1)}`);
    if (rpc != null) parts.push(`supabase_rpc;dur=${rpc.toFixed(1)}`);
    parts.push(`total;dur=${this.totalMs().toFixed(1)}`);
    return parts.join(", ");
  }

  structuredLog(extra?: Record<string, unknown>): Record<string, unknown> {
    return {
      correlationId: this.correlationId,
      totalMs: this.totalMs(),
      authMs: this.phases.get("auth") ?? null,
      supabaseRpcMs: this.phases.get("supabase_rpc") ?? null,
      ...extra,
    };
  }
}

export function attachVerifyEmailHeaders(
  response: Response,
  timer: VerifyEmailServerTimer,
): Response {
  response.headers.set("Server-Timing", timer.buildServerTimingHeader());
  response.headers.set(VERIFY_EMAIL_CORRELATION_HEADER, timer.correlationId);
  return response;
}
