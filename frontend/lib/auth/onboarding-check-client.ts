"use client";

import { getProductDomainFromBrowser } from "@/lib/domain/client";
import type { ProductDomain } from "@/lib/domain/config";
import type { AuthDecision } from "@/types/auth.types";
import { ROUTE_POLICY } from "@/lib/auth/route-policy";

export interface OnboardingCheckResponse {
  onboardingCompleted: boolean;
  whatsappConnected: boolean | "error";
  hasActiveSubscription: boolean | "error";
  hasActiveTrial: boolean | "error";
  isTrialExpired: boolean;
  hasProductAccess: boolean;
  requiresWhatsApp: boolean;
  whatsappSatisfied: boolean;
  canEnterDashboard: boolean;
  nextPath: string;
  reason: AuthDecision["reason"];
  trialDetails?: {
    startedAt: string;
    expiresAt: string;
    planSlug: string;
  };
  _meta?: {
    durationMs: number;
    timestamp: string;
    partialData: boolean;
    source?: string;
    fallback?: boolean;
  };
}

export class OnboardingCheckError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(`Onboarding check failed with status ${status}`);
    this.name = "OnboardingCheckError";
    this.status = status;
    this.data = data;
  }
}

const CACHE_TTL_MS = 30_000;
const LOOP_WINDOW_MS = 8_000;
const LOOP_MAX_ALTERNATIONS = 3;
const LOOP_STORAGE_KEY = "flowauxi_onboarding_redirect_loop";
const cache = new Map<
  string,
  { expiresAt: number; value: OnboardingCheckResponse }
>();
const inFlight = new Map<string, Promise<OnboardingCheckResponse>>();

function getCacheKey(product?: ProductDomain | string) {
  return product || getProductDomainFromBrowser();
}

export function invalidateOnboardingCheckCache(product?: ProductDomain | string) {
  if (product) {
    cache.delete(product);
    inFlight.delete(product);
    return;
  }

  cache.clear();
  inFlight.clear();
}

function buildCheckUrl(product?: ProductDomain | string) {
  if (!product) return "/api/onboarding/check";

  const params = new URLSearchParams({ product });
  return `/api/onboarding/check?${params.toString()}`;
}

function normalizeDestination(
  data: OnboardingCheckResponse,
  product?: ProductDomain | string,
) {
  if (data.nextPath) return data.nextPath;
  return data.canEnterDashboard || data.onboardingCompleted
    ? "/home"
    : `/onboarding-embedded?domain=${product || getProductDomainFromBrowser()}`;
}

export function getOnboardingDestination(
  data: OnboardingCheckResponse,
  product?: ProductDomain | string,
) {
  return normalizeDestination(data, product);
}

/**
 * Check if the current pathname belongs to a dashboard route.
 * Uses ROUTE_POLICY as the single source of truth.
 */
function isDashboardPath(pathname: string): boolean {
  return Object.entries(ROUTE_POLICY).some(
    ([prefix, type]) =>
      type === "normal" && pathname.startsWith(prefix) && prefix !== "/onboarding",
  );
}

function getCurrentRouteKind() {
  if (typeof window === "undefined") return "other";
  const pathname = window.location.pathname;
  if (isDashboardPath(pathname)) return "dashboard";
  if (
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/onboarding-embedded")
  ) {
    return "onboarding";
  }
  return "other";
}

function getTargetRouteKind(targetPath: string) {
  if (isDashboardPath(targetPath)) return "dashboard";
  if (
    targetPath.startsWith("/onboarding") ||
    targetPath.startsWith("/onboarding-embedded")
  ) {
    return "onboarding";
  }
  return "other";
}

export function recordOnboardingRedirect(targetPath: string) {
  if (typeof window === "undefined") {
    return { suppress: false, loopDetected: false };
  }

  const now = Date.now();
  const from = getCurrentRouteKind();
  const to = getTargetRouteKind(targetPath);

  if (from === "other" || to === "other" || from === to) {
    return { suppress: false, loopDetected: false };
  }

  let events: Array<{ at: number; from: string; to: string }> = [];
  try {
    events = JSON.parse(
      window.sessionStorage.getItem(LOOP_STORAGE_KEY) || "[]",
    );
  } catch {
    events = [];
  }

  events = events
    .filter((event) => now - event.at <= LOOP_WINDOW_MS)
    .concat({ at: now, from, to });

  window.sessionStorage.setItem(LOOP_STORAGE_KEY, JSON.stringify(events));

  const loopDetected = events.length > LOOP_MAX_ALTERNATIONS;
  return {
    suppress: loopDetected && to === "dashboard",
    loopDetected,
  };
}

export function clearOnboardingRedirectLoop() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(LOOP_STORAGE_KEY);
}

export async function getOnboardingCheck(params?: {
  product?: ProductDomain | string;
  force?: boolean;
}): Promise<OnboardingCheckResponse> {
  const key = getCacheKey(params?.product);
  const now = Date.now();

  if (!params?.force) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const pending = inFlight.get(key);
    if (pending) return pending;
  }

  const request = fetch(buildCheckUrl(params?.product), {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      invalidateOnboardingCheckCache(key);
      throw new OnboardingCheckError(response.status, data);
    }

    cache.set(key, {
      value: data as OnboardingCheckResponse,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return data as OnboardingCheckResponse;
  });

  inFlight.set(key, request);

  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}
