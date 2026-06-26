/**
 * k6 load test for email verification (Phase 0 baseline + Phase 4 regression).
 *
 * Protocol: 60s warmup ramp, then 50 VU constant load for 3 minutes.
 *
 * Usage:
 *   k6 run scripts/load/k6-verify-email.js \
 *     -e BASE_URL=http://localhost:3001 \
 *     -e SESSION_COOKIE="<firebase session cookie>" \
 *     -e VERIFY_CODE=123456
 *
 * Compare output JSON:
 *   scripts/load/baselines/verify-email-baseline.json
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";
import { textSummary } from "https://jslib.k6.io/k6-summary/0.0.4/index.js";

const verifyLatency = new Trend("verify_email_latency", true);
const authTiming = new Trend("verify_email_server_timing_auth", true);
const rpcTiming = new Trend("verify_email_server_timing_rpc", true);
const totalTiming = new Trend("verify_email_server_timing_total", true);

const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
const SESSION_COOKIE = __ENV.SESSION_COOKIE || "";
const VERIFY_CODE = __ENV.VERIFY_CODE || "000000";
const RECORD_VUS = Number(__ENV.RECORD_VUS || "50");

export const options = {
  scenarios: {
    warmup: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [{ duration: "60s", target: 10 }],
      exec: "verifyEmail",
      tags: { phase: "warmup" },
    },
    record: {
      executor: "constant-vus",
      vus: RECORD_VUS,
      duration: "3m",
      exec: "verifyEmail",
      startTime: "60s",
      tags: { phase: "baseline" },
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    verify_email_latency: ["p(95)<4000"],
  },
};

function parseServerTiming(headerValue) {
  if (!headerValue) return {};
  const out = {};
  for (const part of headerValue.split(",")) {
    const match = part.trim().match(/^([a-z_]+);dur=([0-9.]+)/i);
    if (match) out[match[1]] = Number(match[2]);
  }
  return out;
}

export function verifyEmail() {
  const res = http.post(
    `${BASE_URL}/api/auth/verify-email`,
    JSON.stringify({ code: VERIFY_CODE }),
    {
      headers: {
        "Content-Type": "application/json",
        Cookie: SESSION_COOKIE ? `session=${SESSION_COOKIE}` : "",
      },
      tags: { name: "POST /api/auth/verify-email" },
    },
  );

  verifyLatency.add(res.timings.duration);

  const timing = parseServerTiming(res.headers["Server-Timing"] || "");
  if (timing.auth != null) authTiming.add(timing.auth);
  if (timing.supabase_rpc != null) rpcTiming.add(timing.supabase_rpc);
  if (timing.total != null) totalTiming.add(timing.total);

  check(res, {
    "has response body": (r) => Boolean(r.body),
    "has Server-Timing when authed": (r) =>
      r.status === 401 || Boolean(r.headers["Server-Timing"]),
  });

  sleep(0.5);
}

export function handleSummary(data) {
  const baseline = {
    captured_at: new Date().toISOString(),
    protocol: "60s warmup + 50 VU x 3m record",
    metrics: {
      verify_email_latency: data.metrics.verify_email_latency?.values ?? null,
      verify_email_server_timing_auth:
        data.metrics.verify_email_server_timing_auth?.values ?? null,
      verify_email_server_timing_rpc:
        data.metrics.verify_email_server_timing_rpc?.values ?? null,
      verify_email_server_timing_total:
        data.metrics.verify_email_server_timing_total?.values ?? null,
      http_req_duration: data.metrics.http_req_duration?.values ?? null,
    },
  };

  return {
    stdout: textSummary(data, { indent: " ", enableColors: true }),
    "scripts/load/baselines/verify-email-latest.json": JSON.stringify(baseline, null, 2),
  };
}
