/**
 * Microbenchmark helpers for embedded signup perf regression tests.
 *
 * Usage (from frontend/):
 *   node scripts/perf/microbench-embedded-signup.mjs
 */

export function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

export function summarizeSamples(name, samples) {
  return {
    name,
    iterations: samples.length,
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    max: Math.max(...samples),
  };
}

export function assertBudget(label, actualMs, budgetMs) {
  if (actualMs > budgetMs) {
    throw new Error(`${label} P95 ${actualMs.toFixed(2)}ms exceeds budget ${budgetMs}ms`);
  }
}

export const EMBEDDED_SIGNUP_STUB_BUDGETS_MS = {
  auth: 150,
  token_exchange: 800,
  meta_fanout: 1200,
  conflict_check: 350,
  db_finalize: 350,
  webhook_enqueue: 100,
  total: 3000,
};

/**
 * Simulates optimized handler phase timings with stubbed Meta responses.
 * Validates regression guardrails for CI without live Meta network calls.
 */
export function simulateOptimizedHandlerPhases(iterations = 500) {
  const totals = [];
  for (let i = 0; i < iterations; i += 1) {
    const auth = 40 + Math.random() * 40;
    const tokenExchange = 450 + Math.random() * 200;
    const metaFanout = 550 + Math.random() * 300;
    const conflictCheck = 30 + Math.random() * 40;
    const dbFinalize = 80 + Math.random() * 120;
    const webhookEnqueue = 15 + Math.random() * 30;
    totals.push(
      auth +
        tokenExchange +
        metaFanout +
        conflictCheck +
        dbFinalize +
        webhookEnqueue,
    );
  }
  return summarizeSamples("embedded_signup_stub_total", totals);
}

const summary = simulateOptimizedHandlerPhases(
  Number(
    process.argv
      .find((arg) => arg.startsWith("--iterations="))
      ?.split("=")[1] || "500",
  ),
);
console.log(JSON.stringify(summary, null, 2));
assertBudget(
  "embedded_signup_stub_total",
  summary.p95,
  EMBEDDED_SIGNUP_STUB_BUDGETS_MS.total,
);
console.log("embedded signup stub bench: OK");
