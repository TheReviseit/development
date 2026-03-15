"use client";

/**
 * useFeatureGate Hook — Enterprise Feature Gating
 * ===================================================
 * Replaces hardcoded FEATURE_ACCESS map with server-driven policy decisions.
 *
 * The backend FeatureGateEngine handles all logic:
 *   - Plan-based access control
 *   - Soft/hard limits with usage tracking
 *   - Grace period and subscription state handling
 *   - Idempotent usage increments
 *
 * Usage:
 *   const { allowed, used, remaining, limit, upgradeRequired, isLoading }
 *     = useFeatureGate("create_product");
 *
 *   if (!allowed) {
 *     showUpgradeModal();
 *   }
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────

export interface FeatureDecision {
  allowed: boolean;
  hard_limit: number | null;
  soft_limit: number | null;
  used: number;
  remaining: number | null;
  soft_limit_exceeded: boolean;
  upgrade_required: boolean;
  denial_reason: string | null;
  feature_key: string;
}

export interface UseFeatureGateReturn {
  /** Whether the feature is accessible */
  allowed: boolean;
  /** Current usage count */
  used: number;
  /** Remaining usage before hard limit */
  remaining: number | null;
  /** Hard limit for this feature */
  limit: number | null;
  /** Soft limit (warning threshold) */
  softLimit: number | null;
  /** True if soft limit exceeded but still allowed */
  softLimitExceeded: boolean;
  /** True if user should be prompted to upgrade */
  upgradeRequired: boolean;
  /** Machine-readable denial reason */
  denialReason: string | null;
  /** Loading state for initial fetch */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Re-check the feature (e.g., after plan change) */
  refetch: () => Promise<void>;
  /** Full raw decision from server */
  decision: FeatureDecision | null;
}

// Use relative URL so requests go through the Next.js proxy
// (which handles auth headers). Do NOT call the Flask backend directly.
const CACHE_TTL_MS = 30_000; // Client-side cache: 30 seconds
const STALE_WHILE_REVALIDATE_MS = 60_000; // Show stale data for 60s while refetching

// Client-side decision cache (shared across hook instances)
const decisionCache = new Map<
  string,
  { decision: FeatureDecision; fetchedAt: number }
>();

// ─── Helper ───────────────────────────────────────────────────

function getCacheKey(featureKey: string, domain?: string): string {
  return domain ? `fg:${domain}:${featureKey}` : `fg:${featureKey}`;
}

async function fetchFeatureDecision(
  featureKey: string,
  authToken?: string,
  domain?: string,
): Promise<FeatureDecision> {
  let url = `/api/features/check?feature=${encodeURIComponent(featureKey)}`;
  if (domain) {
    url += `&domain=${encodeURIComponent(domain)}`;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const response = await fetch(url, {
    method: "GET",
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    // If it's a 403 with a decision, return the denial decision
    if (response.status === 403 && errorData.decision) {
      return errorData.decision as FeatureDecision;
    }
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return (await response.json()) as FeatureDecision;
}

// ─── Hook ─────────────────────────────────────────────────────

export function useFeatureGate(
  featureKey: string,
  options?: {
    /** Firebase auth token (if not using cookie-based auth) */
    authToken?: string;
    /** Skip initial fetch (useful for conditional rendering) */
    skip?: boolean;
    /** Custom stale time in ms */
    staleTTL?: number;
    /** Product domain (e.g. "shop", "marketing"). Defaults to "shop". */
    domain?: string;
  },
): UseFeatureGateReturn {
  const [decision, setDecision] = useState<FeatureDecision | null>(null);
  const [isLoading, setIsLoading] = useState(!options?.skip);
  const [error, setError] = useState<string | null>(null);

  const featureKeyRef = useRef(featureKey);
  featureKeyRef.current = featureKey;

  const staleTTL = options?.staleTTL ?? STALE_WHILE_REVALIDATE_MS;

  const fetchDecision = useCallback(async () => {
    const key = getCacheKey(featureKeyRef.current, options?.domain);
    const now = Date.now();

    // Check client-side cache
    const cached = decisionCache.get(key);
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      setDecision(cached.decision);
      setIsLoading(false);
      return;
    }

    // Stale-while-revalidate: show cached data while fetching
    if (cached && now - cached.fetchedAt < staleTTL) {
      setDecision(cached.decision);
      setIsLoading(false);
      // Fetch in background (don't block UI)
    } else {
      setIsLoading(true);
    }

    try {
      const result = await fetchFeatureDecision(
        featureKeyRef.current,
        options?.authToken,
        options?.domain,
      );

      // Update cache
      decisionCache.set(key, { decision: result, fetchedAt: Date.now() });

      // Only update state if feature key hasn't changed
      if (featureKeyRef.current === featureKey) {
        setDecision(result);
        setError(null);
      }
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to check feature";
      if (featureKeyRef.current === featureKey) {
        setError(errorMsg);
      }
      // On error, keep showing cached data if available
      if (!cached) {
        // No cache, fail closed (deny)
        setDecision({
          allowed: false,
          hard_limit: null,
          soft_limit: null,
          used: 0,
          remaining: null,
          soft_limit_exceeded: false,
          upgrade_required: false,
          denial_reason: "network_error",
          feature_key: featureKey,
        });
      }
    } finally {
      if (featureKeyRef.current === featureKey) {
        setIsLoading(false);
      }
    }
  }, [featureKey, options?.authToken, options?.domain, staleTTL]);

  // Initial fetch
  useEffect(() => {
    if (options?.skip) return;
    fetchDecision();
  }, [fetchDecision, options?.skip]);

  return {
    allowed: decision?.allowed ?? false,
    used: decision?.used ?? 0,
    remaining: decision?.remaining ?? null,
    limit: decision?.hard_limit ?? null,
    softLimit: decision?.soft_limit ?? null,
    softLimitExceeded: decision?.soft_limit_exceeded ?? false,
    upgradeRequired: decision?.upgrade_required ?? false,
    denialReason: decision?.denial_reason ?? null,
    isLoading,
    error,
    refetch: fetchDecision,
    decision,
  };
}

// ─── Utility: Clear client-side cache ─────────────────────────

export function clearFeatureGateCache(featureKey?: string): void {
  if (featureKey) {
    decisionCache.delete(getCacheKey(featureKey));
  } else {
    decisionCache.clear();
  }
}

// ─── Utility: Batch check multiple features ───────────────────

export async function checkMultipleFeatures(
  featureKeys: string[],
  authToken?: string,
): Promise<Map<string, FeatureDecision>> {
  const results = new Map<string, FeatureDecision>();

  // Parallel fetch all features
  const promises = featureKeys.map(async (key) => {
    try {
      const decision = await fetchFeatureDecision(key, authToken);
      results.set(key, decision);
      // Cache
      decisionCache.set(getCacheKey(key), {
        decision,
        fetchedAt: Date.now(),
      });
    } catch {
      results.set(key, {
        allowed: false,
        hard_limit: null,
        soft_limit: null,
        used: 0,
        remaining: null,
        soft_limit_exceeded: false,
        upgrade_required: false,
        denial_reason: "network_error",
        feature_key: key,
      });
    }
  });

  await Promise.all(promises);
  return results;
}
