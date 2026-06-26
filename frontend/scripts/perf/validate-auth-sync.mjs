/**
 * Auth sync validation checklist (run after deploying auth/sync fixes).
 *
 * Usage:
 *   node frontend/scripts/perf/validate-auth-sync.mjs
 *
 * Manual steps (browser):
 *   1. Sign up with an existing stale session cookie in browser → sync 200, no 500→202 loop
 *   2. Check response headers include Server-Timing with verify_token, idempotency_claim, total
 *   3. Repeat sync within 60s → warm cache or idempotency hit, total < 1s when warm
 *   4. End-to-end: sync 200 → send-verification 200 → verify-email 200
 */

console.log("Auth Sync Validation Checklist");
console.log("==============================");
console.log("");
console.log("[ ] Signup with stale session cookie → POST /api/auth/sync returns 200");
console.log("[ ] No 500 followed by 202 SYNC_IN_PROGRESS on retry");
console.log("[ ] Response includes Server-Timing: verify_token, idempotency_claim, total");
console.log("[ ] AbortError/timeout returns 504 UPSTREAM_TIMEOUT (not 500)");
console.log("[ ] Second sync within 60s uses warm cache or idempotency (total ms drops)");
console.log("[ ] Full flow: sync → send-verification → verify-email");
console.log("");
console.log("Env recommendations:");
console.log("  SUPABASE_POOLER_URL=<transaction pooler>:6543");
console.log("  AUTH_SYNC_WARM_CACHE_ENABLED=true (default)");
console.log("");
console.log("Automated helper: run k6 or repeat fetch /api/auth/sync with same idToken twice.");
