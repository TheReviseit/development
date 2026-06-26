/**
 * Client-side helpers for embedded signup performance logging.
 */

export function parseServerTimingDurations(
  headerValue: string | null,
): Record<string, number> {
  if (!headerValue) return {};
  const durations: Record<string, number> = {};
  for (const part of headerValue.split(",")) {
    const match = part.trim().match(/^([^;]+);dur=([\d.]+)/);
    if (match) {
      durations[match[1]] = Number(match[2]);
    }
  }
  return durations;
}

export function logEmbeddedSignupClientTiming(params: {
  correlationId?: string | null;
  clientMs: number;
  serverTimingHeader?: string | null;
}): void {
  const serverPhases = parseServerTimingDurations(
    params.serverTimingHeader ?? null,
  );
  console.log("[embedded-signup] client timing", {
    correlation_id: params.correlationId ?? null,
    client_ms: Math.round(params.clientMs),
    server_phases_ms: serverPhases,
    server_total_ms: serverPhases.total ?? null,
  });
}
