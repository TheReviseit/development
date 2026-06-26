/**
 * k6 load test for AI Settings save via Next.js proxy.
 *
 * Usage:
 *   k6 run scripts/load/k6-ai-settings-save.js \
 *     -e BASE_URL=http://localhost:3000 \
 *     -e SESSION_COOKIE="<firebase session cookie>" \
 *     -e VUS=100 -e DURATION=5m
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const saveLatency = new Trend("ai_settings_save_latency", true);
const serverTiming = new Trend("ai_settings_server_timing_proxy_fetch", true);

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SESSION_COOKIE = __ENV.SESSION_COOKIE || "";
const VUS = Number(__ENV.VUS || "50");
const DURATION = __ENV.DURATION || "3m";

export const options = {
  scenarios: {
    steady_save: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: Math.floor(VUS / 2) },
        { duration: DURATION, target: VUS },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    ai_settings_save_latency: ["p(95)<2000"],
  },
};

function samplePayload() {
  return JSON.stringify({
    business_name: "k6 Load Test Business",
    description: "k6 settings save benchmark",
    brand_voice: {
      tone: "professional",
      language_preference: "en",
      greeting_style: "formal",
      tagline: "k6 benchmark",
      unique_selling_points: ["Quality"],
      avoid_topics: [],
      custom_greeting: "Hello",
    },
    faqs: [{ question: "Hours?", answer: "9-6" }],
  });
}

export default function () {
  const correlationId = `k6-${__VU}-${Date.now()}`;
  const res = http.post(`${BASE_URL}/api/business/save`, samplePayload(), {
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-ID": correlationId,
      Cookie: SESSION_COOKIE ? `session=${SESSION_COOKIE}` : "",
    },
    tags: { name: "POST /api/business/save" },
  });

  saveLatency.add(res.timings.duration);

  const timingHeader = res.headers["Server-Timing"] || "";
  const proxyMatch = timingHeader.match(/proxy_fetch;dur=([0-9.]+)/);
  if (proxyMatch) {
    serverTiming.add(Number(proxyMatch[1]));
  }

  check(res, {
    "status is 200 or 401": (r) => r.status === 200 || r.status === 401,
    "has Server-Timing header": (r) => Boolean(r.headers["Server-Timing"]),
    "has correlation id": (r) => Boolean(r.headers["X-Correlation-Id"] || r.headers["X-Correlation-ID"]),
  });

  sleep(Math.random() * 1.5 + 0.5);
}
