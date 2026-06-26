/**
 * Compare latest k6 verify-email run against Phase 0 baseline.
 *
 * Usage:
 *   node scripts/load/compare-verify-email-baseline.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const baselinePath = join(root, "scripts/load/baselines/verify-email-baseline.json");
const latestPath = join(root, "scripts/load/baselines/verify-email-latest.json");

function readJson(path) {
  if (!existsSync(path)) {
    console.error(`Missing file: ${path}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function pctImprovement(before, after) {
  if (before == null || after == null || before === 0) return null;
  return (((before - after) / before) * 100).toFixed(1);
}

const baseline = readJson(baselinePath);
const latest = readJson(latestPath);

console.log("Verify Email Load Test Comparison");
console.log("================================");
console.log(`Baseline captured: ${baseline.captured_at}`);
console.log(`Latest captured:   ${latest.captured_at}`);
console.log("");

const baselineP95 = baseline.metrics?.verify_email_latency?.["p(95)"];
const latestP95 = latest.metrics?.verify_email_latency?.["p(95)"];
const baselineP50 = baseline.metrics?.verify_email_latency?.["p(50)"];
const latestP50 = latest.metrics?.verify_email_latency?.["p(50)"];

console.log(`P50: ${baselineP50 ?? "n/a"} -> ${latestP50 ?? "n/a"} (${pctImprovement(baselineP50, latestP50) ?? "n/a"}% faster)`);
console.log(`P95: ${baselineP95 ?? "n/a"} -> ${latestP95 ?? "n/a"} (${pctImprovement(baselineP95, latestP95) ?? "n/a"}% faster)`);

const rpcP95 = latest.metrics?.verify_email_server_timing_rpc?.["p(95)"];
const totalP95 = latest.metrics?.verify_email_server_timing_total?.["p(95)"];
console.log("");
console.log(`Latest Server-Timing RPC P95: ${rpcP95 ?? "n/a"} ms`);
console.log(`Latest Server-Timing total P95: ${totalP95 ?? "n/a"} ms`);

if (latestP95 != null && latestP95 <= 120) {
  console.log("\nPASS: verify-email P95 within 120ms warm budget.");
  process.exit(0);
}

if (baseline.metrics == null) {
  console.log("\nNOTE: Baseline metrics are placeholders until first k6 run.");
  process.exit(0);
}

console.log("\nWARN: verify-email P95 above 120ms warm budget or baseline missing metrics.");
process.exit(0);
