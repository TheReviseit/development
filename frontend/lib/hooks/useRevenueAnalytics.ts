"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";

export type TimeRange = "day" | "week" | "month" | "6months" | "year";

export interface RevenueBucket {
  timestamp: string;
  revenue: number;
  label: string;
}

export interface RevenueComparison {
  previousPeriod: number;
  deltaPercent: number;
}

export interface RevenueData {
  range: TimeRange;
  currency: string;
  buckets: RevenueBucket[];
  totalRevenue: number;
  comparison: RevenueComparison;
  metadata?: {
    total_orders: number;
    orders_by_status: Record<string, number>;
    earliest_order: string | null;
    latest_order: string | null;
    multiple_currencies: boolean;
    available_currencies?: string[];
  };
}

interface UseRevenueAnalyticsResult {
  data: RevenueData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Cache for storing fetched data per range
const revenueCache = new Map<
  TimeRange,
  { data: RevenueData; timestamp: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache
const MAX_RETRIES = 2;
const NON_RETRYABLE_STATUSES = new Set([401, 403, 503]);

/**
 * Hook for fetching revenue analytics data.
 *
 * Pass `enabled = false` to skip fetching (e.g. when the user's plan
 * doesn't include analytics). This prevents wasted API calls and avoids
 * error noise in the console.
 */
export function useRevenueAnalytics(
  range: TimeRange,
  enabled: boolean = true,
): UseRevenueAnalyticsResult {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  // Use refs for retry state to avoid re-creating fetchRevenue on every retry
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchRevenue = useCallback(async () => {
    // Check cache first
    const cached = revenueCache.get(range);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const url = `/api/analytics/revenue?range=${range}`;

      const response = await fetch(url, {
        headers: { "Cache-Control": "no-cache" },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        console.error("[Revenue Analytics] API Error:", {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error || "unknown",
        });

        // Non-retryable — set error and stop
        if (NON_RETRYABLE_STATUSES.has(response.status)) {
          setError(errorData.error || `Request failed with status ${response.status}`);
          setLoading(false);
          return;
        }

        throw new Error(
          errorData.error || `Failed to fetch revenue data: ${response.status}`,
        );
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to fetch revenue data");
      }

      // Normalize the data
      const normalizedData: RevenueData = {
        range: result.range,
        currency: result.currency || "INR",
        buckets: result.buckets || [],
        totalRevenue: result.totalRevenue || 0,
        comparison: result.comparison || { previousPeriod: 0, deltaPercent: 0 },
        metadata: result.metadata,
      };

      // Cache the result
      revenueCache.set(range, { data: normalizedData, timestamp: Date.now() });

      setData(normalizedData);
      setError(null);
      retryCountRef.current = 0; // Reset retries on success
    } catch (err) {
      // Ignore aborted requests
      if (err instanceof DOMException && err.name === "AbortError") return;

      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch revenue data";

      console.error("[Revenue Analytics] Fetch error:", {
        message: errorMessage,
        range,
        retry: retryCountRef.current,
      });

      setError(errorMessage);

      // Retry with exponential backoff (max MAX_RETRIES)
      if (retryCountRef.current < MAX_RETRIES) {
        const attempt = retryCountRef.current + 1;
        retryCountRef.current = attempt;
        retryTimerRef.current = setTimeout(() => {
          fetchRevenue();
        }, 1000 * Math.pow(2, attempt - 1));
      }
    } finally {
      setLoading(false);
    }
  }, [range]); // Only depends on `range` — no retryCount in deps

  // Fetch on mount / range change — only when enabled
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    retryCountRef.current = 0;
    fetchRevenue();

    return () => {
      // Cleanup: abort in-flight request and cancel pending retry
      abortRef.current?.abort();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [range, fetchRevenue, enabled]);

  const refetch = useCallback(() => {
    revenueCache.delete(range);
    retryCountRef.current = 0;
    fetchRevenue();
  }, [range, fetchRevenue]);

  return useMemo(
    () => ({
      data,
      loading,
      error,
      refetch,
    }),
    [data, loading, error, refetch],
  );
}

/**
 * Format currency value for display
 */
export function formatCurrency(
  amount: number,
  currency: string = "INR",
): string {
  if (currency === "INR") {
    // Format Indian rupees
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(1)}Cr`;
    } else if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(1)}L`;
    } else if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}k`;
    }
    return `₹${amount.toLocaleString("en-IN")}`;
  }

  // USD or other currencies
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`;
  }
  return `$${amount.toLocaleString("en-US")}`;
}

/**
 * Get display label for time range
 */
export function getTimeRangeLabel(range: TimeRange): string {
  switch (range) {
    case "day":
      return "Day";
    case "week":
      return "Week";
    case "month":
      return "Monthly";
    case "6months":
      return "6 Months";
    case "year":
      return "Year";
    default:
      return "Monthly";
  }
}
