import type { NextRequest, NextResponse } from "next/server";
import type { RuntimeFlags } from "./runtime-flags";

export interface BillingBehaviorCohort {
  canary: boolean;
  domainFix: boolean;
  pinnedAt: number;
}

const COOKIE_NAME = "billing_behavior";
const COOKIE_MAX_AGE = 60 * 60 * 4; // 4h for onboarding routes (plan tradeoff)

function stableHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

function parseCookieValue(raw: string | undefined): BillingBehaviorCohort | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as BillingBehaviorCohort;
    if (typeof parsed.canary === "boolean" && typeof parsed.domainFix === "boolean") {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveBillingBehavior(
  request: NextRequest,
  flags: RuntimeFlags,
  userId?: string,
): BillingBehaviorCohort {
  const pinningEnabled = flags.billing_behavior_pinning !== false;
  const existing = parseCookieValue(request.cookies.get(COOKIE_NAME)?.value);
  if (pinningEnabled && existing) {
    return existing;
  }

  const sessionCookie =
    request.cookies.get("session")?.value ||
    request.cookies.get("__session")?.value ||
    "anon";
  const uid = userId || "anon";
  const bucket = stableHash(`${uid}:${sessionCookie}`);
  const canaryPercent = Number(flags.canary_percent ?? 0);

  const cohort: BillingBehaviorCohort = {
    canary: bucket < canaryPercent,
    domainFix: flags.fix_domain_context !== false,
    pinnedAt: Date.now(),
  };
  return cohort;
}

export function attachBillingBehaviorCookie(
  response: NextResponse,
  cohort: BillingBehaviorCohort,
): NextResponse {
  response.cookies.set(COOKIE_NAME, encodeURIComponent(JSON.stringify(cohort)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return response;
}
