export function recordConnectionMetric(
  event: string,
  fields: Record<string, unknown> = {},
) {
  console.log("[WhatsAppConnectionMetric]", {
    event,
    ...fields,
    timestamp: new Date().toISOString(),
  });
}
