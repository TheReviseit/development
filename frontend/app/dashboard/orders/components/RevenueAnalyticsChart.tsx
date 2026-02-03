"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  useRevenueAnalytics,
  formatCurrency,
  getTimeRangeLabel,
  type TimeRange,
} from "@/lib/hooks/useRevenueAnalytics";
import styles from "./RevenueAnalyticsChart.module.css";

interface Props {
  className?: string;
}

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Monthly" },
  { value: "6months", label: "6 Months" },
  { value: "year", label: "Year" },
];

/**
 * Custom tooltip component for the chart
 */
function CustomTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{
    payload: { label: string; revenue: number; timestamp: string };
  }>;
  currency: string;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0].payload;
  const formattedRevenue = formatCurrency(data.revenue, currency);

  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipRevenue}>{formattedRevenue}</div>
      <div className={styles.tooltipDate}>{data.label}</div>
    </div>
  );
}

/**
 * Skeleton loader for the chart
 */
function ChartSkeleton() {
  return (
    <div className={styles.skeleton}>
      <div className={styles.skeletonHeader}>
        <div className={styles.skeletonTitle}></div>
        <div className={styles.skeletonDropdown}></div>
      </div>
      <div className={styles.skeletonChart}>
        <div className={styles.skeletonPulse}></div>
      </div>
    </div>
  );
}

/**
 * Enterprise-grade Revenue Analytics Chart
 *
 * Features:
 * - Stripe-style smooth area chart with gradient fill
 * - Time range selector (Day/Week/Month/6M/Year)
 * - Hover tooltip with exact revenue
 * - Skeleton loading state
 * - Responsive design
 * - Previous period comparison
 */
export function RevenueAnalyticsChart({ className }: Props) {
  const [range, setRange] = useState<TimeRange>("month");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { data, loading, error } = useRevenueAnalytics(range);

  // Format Y-axis tick
  const yAxisFormatter = useMemo(() => {
    return (value: number) => {
      if (value === 0) return "0k";
      if (value >= 1000) return `${Math.round(value / 1000)}k`;
      return String(value);
    };
  }, []);

  // Calculate Y-axis domain
  const yAxisDomain = useMemo(() => {
    if (!data?.buckets || data.buckets.length === 0) return [0, 10000];

    const maxRevenue = Math.max(...data.buckets.map((b) => b.revenue));
    const roundedMax = Math.ceil(maxRevenue / 5000) * 5000;
    return [0, Math.max(roundedMax, 1000)];
  }, [data]);

  // Handle dropdown toggle
  const handleDropdownToggle = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  // Handle range selection
  const handleRangeSelect = (newRange: TimeRange) => {
    setRange(newRange);
    setIsDropdownOpen(false);
  };

  // Show skeleton while loading (first load only)
  if (loading && !data) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        <ChartSkeleton />
      </div>
    );
  }

  // Show error state
  if (error && !data) {
    return (
      <div className={`${styles.container} ${className || ""}`}>
        <div className={styles.error}>
          <div className={styles.errorTitle}>Failed to load revenue data</div>
          <div className={styles.errorMessage}>{error}</div>
          <button
            className={styles.retryButton}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const chartData = data?.buckets || [];
  const currency = data?.currency || "INR";
  const totalRevenue = data?.totalRevenue || 0;
  const comparison = data?.comparison;
  const metadata = data?.metadata;

  // Empty state: no revenue data
  const hasNoData = chartData.length === 0 || totalRevenue === 0;
  const isNewRevenue = comparison?.deltaPercent === null;

  return (
    <div className={`${styles.container} ${className || ""}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <h3 className={styles.title}>Revenue analytics</h3>
          {comparison &&
            comparison.deltaPercent !== null &&
            comparison.deltaPercent !== 0 && (
              <span
                className={`${styles.delta} ${
                  comparison.deltaPercent > 0
                    ? styles.deltaPositive
                    : styles.deltaNegative
                }`}
              >
                {comparison.deltaPercent > 0 ? "+" : ""}
                {comparison.deltaPercent}%
              </span>
            )}
        </div>

        {/* Time Range Dropdown */}
        <div className={styles.dropdownContainer}>
          <button
            className={styles.dropdownButton}
            onClick={handleDropdownToggle}
            aria-expanded={isDropdownOpen}
            aria-haspopup="listbox"
          >
            <span>{getTimeRangeLabel(range)}</span>
            <svg
              className={`${styles.dropdownIcon} ${isDropdownOpen ? styles.dropdownIconOpen : ""}`}
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
            >
              <path
                d="M4 6L8 10L12 6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {isDropdownOpen && (
            <div className={styles.dropdownMenu} role="listbox">
              {TIME_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`${styles.dropdownItem} ${
                    range === option.value ? styles.dropdownItemActive : ""
                  }`}
                  onClick={() => handleRangeSelect(option.value)}
                  role="option"
                  aria-selected={range === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Empty State */}
      {hasNoData && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="9" x2="9" y2="15" />
              <line x1="15" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div className={styles.emptyTitle}>No revenue data yet</div>
          <div className={styles.emptyMessage}>
            {metadata?.total_orders === 0
              ? "Start creating completed orders to see revenue analytics."
              : "Complete some orders to see revenue data in this time range."}
          </div>
        </div>
      )}

      {/* Chart */}
      {!hasNoData && (
        <div className={styles.chartWrapper}>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={chartData}
              margin={{ top: 20, right: 10, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="revenueGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#ffffff" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#ffffff" stopOpacity={0.02} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(48, 45, 45, 0.5)"
                vertical={false}
              />

              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "rgb(0, 0, 0)", fontSize: 12 }}
                dy={10}
                interval="preserveStartEnd"
              />

              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "rgb(0, 0, 0)", fontSize: 12 }}
                tickFormatter={yAxisFormatter}
                domain={yAxisDomain}
                dx={-5}
              />

              <Tooltip
                content={<CustomTooltip currency={currency} />}
                cursor={{ stroke: "rgb(0, 0, 0)", strokeWidth: 1 }}
              />

              <Area
                type="monotone"
                dataKey="revenue"
                stroke="rgb(0, 0, 0)"
                strokeWidth={2}
                fill="url(#revenueGradient)"
                activeDot={{
                  r: 6,
                  fill: "#ffffff",
                  stroke: "#1a1a2e",
                  strokeWidth: 3,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Loading overlay for range switching */}
      {loading && data && (
        <div className={styles.loadingOverlay}>
          <div className={styles.loadingSpinner}></div>
        </div>
      )}
    </div>
  );
}

export default RevenueAnalyticsChart;
