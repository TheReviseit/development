"use client";

/**
 * Client-side performance instrumentation for AI Settings save.
 */

export const CLIENT_SAVE_MARK_PREFIX = "ai-settings-save";

export type ClientSavePhase =
  | "convert"
  | "stringify"
  | "fetch"
  | "total";

export function createClientSaveCorrelationId(): string {
  return crypto.randomUUID();
}

export function markSavePhase(
  correlationId: string,
  phase: ClientSavePhase | "start" | "done",
): void {
  if (typeof performance === "undefined" || !performance.mark) return;
  performance.mark(`${CLIENT_SAVE_MARK_PREFIX}:${correlationId}:${phase}`);
}

export function measureSavePhases(correlationId: string): Record<string, number> {
  if (typeof performance === "undefined" || !performance.measure) return {};

  const pairs: Array<[string, ClientSavePhase | "start" | "done"]> = [
    ["convert", "convert"],
    ["stringify", "stringify"],
    ["fetch", "fetch"],
    ["total", "done"],
  ];

  const out: Record<string, number> = {};
  for (const [name, endPhase] of pairs) {
    const measureName = `${CLIENT_SAVE_MARK_PREFIX}:${correlationId}:${name}`;
    try {
      performance.measure(
        measureName,
        `${CLIENT_SAVE_MARK_PREFIX}:${correlationId}:start`,
        `${CLIENT_SAVE_MARK_PREFIX}:${correlationId}:${endPhase}`,
      );
      const entries = performance.getEntriesByName(measureName);
      const last = entries[entries.length - 1];
      if (last) out[name] = Math.round(last.duration * 100) / 100;
    } catch {
      // Ignore missing marks (SSR/tests)
    }
  }
  return out;
}

export function logClientSaveTiming(
  correlationId: string,
  phases: Record<string, number>,
  extra: Record<string, unknown> = {},
): void {
  if (process.env.NODE_ENV === "production") {
    console.info("[AI Settings Save]", {
      event: "ai_settings_save_client_timing",
      correlation_id: correlationId,
      phases_ms: phases,
      ...extra,
    });
    return;
  }
  console.log("[AI Settings Save] client timing", {
    correlation_id: correlationId,
    phases_ms: phases,
    ...extra,
  });
}

export async function fetchBusinessSave(
  correlationId: string,
  body: string,
): Promise<Response> {
  markSavePhase(correlationId, "fetch");
  const response = await fetch("/api/business/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-ID": correlationId,
    },
    body,
  });
  markSavePhase(correlationId, "done");
  return response;
}
