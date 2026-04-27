/**
 * useSubscription — React Query-backed subscription status hook
 * ==============================================================
 *
 * FAANG-GRADE: Production-ready subscription state management with:
 *
 * 1. CACHING: React Query staleTime=30s — prevents hammering /billing-status
 * 2. RETRY: 2 retries with exponential backoff on failure
 * 3. TIMEOUT: 3s AbortController timeout per request
 * 4. BOUNDED FAIL-OPEN: 30s grace on network error, then lock
 * 5. REFETCH ON FOCUS: catches real-time trial expiry when user returns
 * 6. FEATURE GUARDS: hasFeatureAccess() for per-feature gating
 * 7. SOFT UNLOCK: refresh() + event listener for post-payment unlock
 *
 * Usage:
 *   const { isLocked, lockReason, trial, hasFeatureAccess, refresh } = useSubscription();
 *
 * Architecture:
 *   - Single source of truth for all subscription state
 *   - Query key: ['subscription-status']
 *   - Invalidated on: 'subscription-updated' CustomEvent, window focus
 *   - Used by: SubscriptionProvider, dashboard layout, any component
 */

"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import type { BillingLockReason, TrialInfo } from "@/app/dashboard/components/BillingLockScreen";
import { getProductDomainFromBrowser } from "@/lib/domain/client";

// =============================================================================
// TYPES
// =============================================================================

export interface SubscriptionStatus {
  /** Whether dashboard should be locked */
  locked: boolean;
  /** Why it's locked — null if not locked */
  reason: BillingLockReason | null;
  /** Raw subscription status string from DB */
  status: string | null;
  /** Trial metadata (if user has/had a trial) */
  trial: TrialInfo | null;
  /** API error indicator */
  error?: string;
}

export interface UseSubscriptionReturn {
  /** Subscription status data */
  data: SubscriptionStatus | null;
  /** Whether the dashboard should be locked */
  isLocked: boolean;
  /** Lock reason for BillingLockScreen */
  lockReason: BillingLockReason | null;
  /** Trial info (if available) */
  trial: TrialInfo | null;
  /** Raw subscription status */
  subscriptionStatus: string | null;
  /** Whether initial fetch is still loading */
  isLoading: boolean;
  /** Whether a background refetch is happening */
  isRefetching: boolean;
  /** Whether we're in bounded fail-open grace period */
  isGracePeriod: boolean;
  /** Force refresh subscription status */
  refresh: () => Promise<void>;
  /**
   * Feature-level access guard.
   * Returns true if user has access to specified feature.
   * Returns false if subscription is locked.
   * Future: can wire to backend FeatureGateEngine per-feature.
   */
  hasFeatureAccess: (featureKey: string) => boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** How long data is considered fresh (no refetch) */
const STALE_TIME_MS = 30_000; // 30 seconds

/** Max time a fetch can take before abort */
const FETCH_TIMEOUT_MS = 8_000; // 8 seconds

/** How long to allow access on network error before locking */
const FAIL_OPEN_GRACE_MS = 30_000; // 30 seconds

/** Query cache key base (domain is appended) */
const QUERY_KEY_BASE = ["subscription-status"] as const;

// =============================================================================
// FETCH FUNCTION
// =============================================================================

/**
 * Fetch billing status with timeout protection.
 * Returns structured data or throws on fatal error.
 */
async function fetchBillingStatus(domain: string): Promise<SubscriptionStatus> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch("/api/subscription/billing-status", {
      credentials: "include",
      cache: "no-store",
      headers: {
        // Billing status is domain-aware on the server.
        "x-product-domain": domain,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Auth errors → don't lock (handled by auth guard)
      if (response.status === 401) {
        return { locked: false, reason: null, status: null, trial: null };
      }
      throw new Error(`billing-status HTTP ${response.status}`);
    }

    const data = await response.json();

    return {
      locked: data.locked ?? false,
      reason: (data.reason as BillingLockReason) ?? null,
      status: data.status ?? null,
      trial: data.trial ?? null,
      error: data.error,
    };
  } catch (error: any) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      console.warn("[useSubscription] Fetch timed out after ", FETCH_TIMEOUT_MS, "ms");
      throw new Error("TIMEOUT");
    }

    throw error;
  }
}

// =============================================================================
// HOOK
// =============================================================================

export function useSubscription(): UseSubscriptionReturn {
  const queryClient = useQueryClient();
  const domain = getProductDomainFromBrowser();

  // Bounded fail-open: track last successful check
  const lastSuccessRef = useRef<number>(Date.now());

  const {
    data,
    isLoading,
    isRefetching,
    error,
  } = useQuery<SubscriptionStatus>({
    queryKey: [...QUERY_KEY_BASE, domain],
    queryFn: () => fetchBillingStatus(domain),
    staleTime: STALE_TIME_MS,
    refetchOnWindowFocus: true,   // Catch real-time trial expiry
    refetchOnReconnect: true,     // Network recovery
    retry: 2,                      // 2 retries with backoff
    retryDelay: (attempt) => Math.min(1000 * Math.pow(2, attempt), 5000),
    // Don't refetch by default on interval — explicit on billing pages
  });

  // Update last success timestamp on every successful fetch
  useEffect(() => {
    if (data && !error) {
      lastSuccessRef.current = Date.now();
    }
  }, [data, error]);

  // Listen for subscription-updated events → invalidate cache
  useEffect(() => {
    const handleSubUpdated = () => {
      console.info("[useSubscription] subscription-updated event → invalidating cache");
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
    };

    const handleProductActivated = () => {
      console.info("[useSubscription] product-activated event → invalidating cache");
      queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
    };

    window.addEventListener("subscription-updated", handleSubUpdated);
    window.addEventListener("product-activated", handleProductActivated);

    return () => {
      window.removeEventListener("subscription-updated", handleSubUpdated);
      window.removeEventListener("product-activated", handleProductActivated);
    };
  }, [queryClient]);

  // =======================================================================
  // BOUNDED FAIL-OPEN
  // =======================================================================
  // On network error: if last successful check was < 30s ago, allow access.
  // If older than 30s, lock the dashboard (prevent permanent bypass).
  const isGracePeriod =
    !!error &&
    !data &&
    Date.now() - lastSuccessRef.current < FAIL_OPEN_GRACE_MS;

  // Determine lock state
  const isLocked = (() => {
    // Still loading initial data → don't lock (avoid flash)
    if (isLoading) return false;

    // In grace period → allow access temporarily
    if (isGracePeriod) return false;

    // Network error BEYOND grace → lock
    if (error && !data) return true;

    // Use server response
    return data?.locked ?? false;
  })();

  const lockReason = isLocked ? (data?.reason ?? "unknown") : null;

  // =======================================================================
  // FEATURE GUARDS
  // =======================================================================
  const hasFeatureAccess = useCallback(
    (featureKey: string): boolean => {
      // If locked, no features accessible
      if (isLocked) return false;

      // If still loading, allow access (optimistic)
      if (isLoading) return true;

      // If subscription is active/trialing, all features accessible
      // Future: wire to backend FeatureGateEngine for per-feature granularity
      const status = data?.status;
      if (
        status === "active" ||
        status === "trialing" ||
        status === "trial" ||
        status === "grace_period"
      ) {
        return true;
      }

      // Default: allow if not explicitly locked
      return !isLocked;
    },
    [isLocked, isLoading, data?.status]
  );

  // =======================================================================
  // REFRESH
  // =======================================================================
  const refresh = useCallback(async () => {
    console.info("[useSubscription] Manual refresh triggered");
    await queryClient.invalidateQueries({ queryKey: QUERY_KEY_BASE });
  }, [queryClient]);

  return {
    data: data ?? null,
    isLocked,
    lockReason,
    trial: data?.trial ?? null,
    subscriptionStatus: data?.status ?? null,
    isLoading,
    isRefetching,
    isGracePeriod,
    refresh,
    hasFeatureAccess,
  };
}
