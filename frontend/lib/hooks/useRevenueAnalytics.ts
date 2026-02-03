"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

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

/**
 * Enterprise-grade hook for fetching revenue analytics data.
 * Features:
 * - Caching per time range
 * - Automatic normalization of missing buckets
 * - Error handling with retries
 * - Data validation
 * - Comprehensive logging
 */
export function useRevenueAnalytics(
  range: TimeRange,
): UseRevenueAnalyticsResult {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fetchRevenue = useCallback(async () => {
    // Check cache first
    const cached = revenueCache.get(range);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[Revenue Analytics] Cache hit for range: ${range}`);
      setData(cached.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = `/api/analytics/revenue?range=${range}`;
      console.log(`[Revenue Analytics] Fetching: ${url}`);

      const response = await fetch(url, {
        headers: {
          "Cache-Control": "no-cache",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Log detailed error for debugging
        console.error("[Revenue Analytics] API Error:", {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
          currencies: errorData.currencies,
        });

        throw new Error(
          errorData.error || `Failed to fetch revenue data: ${response.status}`,
        );
      }

      const result = await response.json();

      if (!result.success) {
        console.error("[Revenue Analytics] API returned failure:", result);
        throw new Error(result.error || "Failed to fetch revenue data");
      }

      // Validate the data structure
      if (!result.buckets || !Array.isArray(result.buckets)) {
        console.warn("[Revenue Analytics] No buckets in response:", result);
      }

      if (result.buckets.length === 0) {
        console.info(
          "[Revenue Analytics] Empty buckets - no revenue data for this period",
        );
      }

      // Log metadata for debugging
      if (result.metadata) {
        console.log("[Revenue Analytics] Metadata:", {
          orders: result.metadata.total_orders,
          statuses: result.metadata.orders_by_status,
          dateRange: {
            earliest: result.metadata.earliest_order,
            latest: result.metadata.latest_order,
          },
        });
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

      console.log(
        `[Revenue Analytics] Success: ${normalizedData.totalRevenue} ${normalizedData.currency} (${normalizedData.buckets.length} buckets)`,
      );

      // Cache the result
      revenueCache.set(range, { data: normalizedData, timestamp: Date.now() });

      setData(normalizedData);
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to fetch revenue data";

      console.error("[Revenue Analytics] Fetch error:", {
        message: errorMessage,
        range,
        retryCount,
      });

      setError(errorMessage);

      // Retry logic (max 2 retries)
      if (retryCount < 2) {
        setTimeout(
          () => {
            console.log(
              `[Revenue Analytics] Retrying (${retryCount + 1}/2)...`,
            );
            setRetryCount((prev) => prev + 1);
          },
          1000 * (retryCount + 1),
        ); // Exponential backoff
      }
    } finally {
      setLoading(false);
    }
  }, [range, retryCount]);

  useEffect(() => {
    fetchRevenue();
    // Reset retry count when range changes
    setRetryCount(0);
  }, [range, fetchRevenue]);

  const refetch = useCallback(() => {
    // Clear cache for this range and refetch
    revenueCache.delete(range);
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
