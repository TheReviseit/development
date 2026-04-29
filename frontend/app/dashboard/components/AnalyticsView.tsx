"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import styles from "../dashboard.module.css";
import { useAuth } from "@/app/components/auth/AuthProvider";
import { fetchAnalyticsOverview, AnalyticsOverview } from "@/lib/api/whatsapp";
import { RevenueAnalyticsChart } from "../orders/components/RevenueAnalyticsChart";
import {
  useRevenueAnalytics,
  formatCurrency,
} from "@/lib/hooks/useRevenueAnalytics";
import { useFeatureGate } from "@/lib/hooks/useFeatureGate";
import { getProductDomainFromBrowser } from "@/lib/domain/client";
import LoadingSpinner from "@/app/components/ui/LoadingSpinner";
import { AnalyticsDateRangeSelector } from "./AnalyticsDateRangeSelector";
import {
  createPresetAnalyticsDateRange,
  getRecommendedChartGrouping,
  toRevenueAnalyticsRequest,
} from "@/lib/analytics/dateRange";

// Icon components
const SendIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line
      x1="22"
      y1="2"
      x2="11"
      y2="13"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <polygon
      points="22 2 15 22 11 13 2 9 22 2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DeliveredIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      d="M22 11.08V12a10 10 0 1 1-5.93-9.14"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <polyline
      points="22 4 12 14.01 9 11.01"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ReadIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle
      cx="12"
      cy="12"
      r="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const AIIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a2 2 0 0 1 0 4h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a2 2 0 0 1 0-4h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
  </svg>
);

const ConversationIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path
      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const OrdersIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="9" y1="9" x2="9" y2="15"></line>
    <line x1="15" y1="9" x2="15" y2="15"></line>
  </svg>
);

const RevenueIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="1" x2="12" y2="23"></line>
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
  </svg>
);

const UsersIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
    <circle cx="9" cy="7" r="4"></circle>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
  </svg>
);

export default function AnalyticsView() {
  const { user, firebaseUser } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState(() =>
    createPresetAnalyticsDateRange("week"),
  );

  // Use Firebase UID for backend API calls (X-User-Id header expects Firebase UID)
  // user?.id is the Supabase UUID which the backend cannot map
  const userId = firebaseUser?.uid || "";

  // Resolve the current product domain so the feature gate checks the
  // correct subscription. Without this, it defaults to "shop" and users
  // on the marketing domain are denied even with an active subscription.
  // Lazy initializer avoids a wasted first render with wrong domain.
  const [currentDomain] = useState(() => getProductDomainFromBrowser());

  // Feature gate: advanced_analytics — server-authoritative check via
  // backend FeatureGateEngine. Respects subscription status (incl.
  // pending_upgrade), plan-level feature config, and global flags.
  const { allowed: canAccessAnalytics, isLoading: subLoading } =
    useFeatureGate("advanced_analytics", { domain: currentDomain });

  const chartGrouping = useMemo(
    () => getRecommendedChartGrouping(selectedRange),
    [selectedRange],
  );
  const revenueRange = useMemo(
    () => toRevenueAnalyticsRequest(selectedRange),
    [selectedRange],
  );
  const {
    data: revenueData,
    loading: revenueLoading,
    error: revenueError,
    refetch: refetchRevenue,
  } = useRevenueAnalytics(revenueRange, canAccessAnalytics);

  // Fetch analytics data
  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAnalyticsOverview(userId, selectedRange);
      setAnalytics(data);
    } catch (err: any) {
      console.error("Failed to fetch analytics:", err);
      setError(err.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [userId, selectedRange]);

  const handleRefresh = useCallback(() => {
    loadAnalytics();
    refetchRevenue();
  }, [loadAnalytics, refetchRevenue]);

  useEffect(() => {
    if (canAccessAnalytics) {
      loadAnalytics();
    }
  }, [loadAnalytics, canAccessAnalytics]);

  // Format large numbers
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toString();
  };

  // Build stats cards from real data
  const stats = analytics
    ? [
        {
          id: "orders",
          label: "Orders Placed",
          value: revenueData?.metadata?.total_orders
            ? revenueData.metadata.total_orders.toString()
            : "0",
          subtitle: "Completed orders",
          icon: <OrdersIcon />,
          color: "#4ade80",
        },
        {
          id: "revenue",
          label: "Revenue Generated",
          value: revenueData
            ? formatCurrency(revenueData.totalRevenue, revenueData.currency)
            : "₹0",
          subtitle: "Total revenue",
          icon: <RevenueIcon />,
          color: "#60a5fa",
        },
        {
          id: "customers",
          label: "Total Customers",
          value: revenueData?.metadata?.total_orders
            ? revenueData.metadata.total_orders.toString()
            : "0",
          subtitle: "Unique buyers",
          icon: <UsersIcon />,
          color: "#a78bfa",
        },
        {
          id: "ai-replies",
          label: "AI Replies Sent",
          value: formatNumber(analytics?.ai?.replies_generated || 0),
          subtitle: "Automated responses",
          icon: <AIIcon />,
          color: "#fbbf24",
        },
      ]
    : [];

  // Build grouped chart data based on the selected date span.
  const buildChartData = () => {
    const rawDates = analytics?.trends.dates || [];
    const rawSent = analytics?.trends.sent || [];

    if (rawDates.length === 0) return { data: [], labels: [] };

    const parseChartDate = (value: string) => new Date(`${value}T00:00:00`);

    if (chartGrouping === "Daily") {
      return {
        data: rawSent,
        labels: rawDates.map((d) => {
          const date = parseChartDate(d);
          return `${date.getMonth() + 1}/${date.getDate()}`;
        }),
      };
    }

    if (chartGrouping === "Weekly") {
      const buckets: { key: string; label: string; total: number }[] = [];
      rawDates.forEach((d, i) => {
        const date = parseChartDate(d);
        // ISO week number
        const dayOfWeek = date.getDay(); // 0=Sun
        const monday = new Date(date);
        monday.setDate(date.getDate() - ((dayOfWeek + 6) % 7));
        const key = monday.toISOString().slice(0, 10);
        const label = `${monday.getMonth() + 1}/${monday.getDate()}`;
        const existing = buckets.find((b) => b.key === key);
        if (existing) {
          existing.total += rawSent[i] || 0;
        } else {
          buckets.push({ key, label, total: rawSent[i] || 0 });
        }
      });
      return {
        data: buckets.map((b) => b.total),
        labels: buckets.map((b) => `W/${b.label}`),
      };
    }

    // Monthly
    const buckets: { key: string; label: string; total: number }[] = [];
    rawDates.forEach((d, i) => {
      const date = parseChartDate(d);
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const label = date.toLocaleString("default", {
        month: "short",
        year: "2-digit",
      });
      const existing = buckets.find((b) => b.key === key);
      if (existing) {
        existing.total += rawSent[i] || 0;
      } else {
        buckets.push({ key, label, total: rawSent[i] || 0 });
      }
    });
    return {
      data: buckets.map((b) => b.total),
      labels: buckets.map((b) => b.label),
    };
  };

  const { data: chartData, labels: chartLabels } = buildChartData();
  const maxValue = Math.max(...(chartData.length ? chartData : [0]), 1);

  // ─── Subscription still loading — show nothing yet ──────────────────
  if (subLoading) {
    return (
      <div className={styles.analyticsView}>
        <div className={styles.viewHeader}>
          <div>
            <h1 className={styles.viewTitle}>Store & WhatsApp Analytics</h1>
            <p className={styles.viewSubtitle}>
              Monitor your messaging performance and engagement
            </p>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
          }}
        >
          <LoadingSpinner text="Loading analytics..." />
        </div>
      </div>
    );
  }

  // ─── STARTER PLAN: Full-page upgrade gate ───────────────────────────
  if (!canAccessAnalytics) {
    return (
      <div className={styles.analyticsView}>
        {/* Header */}
        <div className={styles.viewHeader}>
          <div>
            <h1 className={styles.viewTitle}>Store & WhatsApp Analytics</h1>
            <p className={styles.viewSubtitle}>
              Monitor your messaging performance and engagement
            </p>
          </div>
        </div>

        {/* Professional Upgrade Card */}
        <div
          style={{
            maxWidth: "480px",
            margin: "48px auto",
            background: "#0f0f0f",
            borderRadius: "16px",
            padding: "40px 36px",
            textAlign: "center",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* Lock Icon */}
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: "rgba(255,255,255,0.04)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#b0b0b0"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          {/* Title */}
          <h2
            style={{
              color: "#ffffff",
              fontSize: "20px",
              fontWeight: 600,
              margin: "0 0 6px 0",
              letterSpacing: "-0.01em",
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
            }}
          >
            Analytics is a Business feature
          </h2>
          <p
            style={{
              color: "#808080",
              fontSize: "13px",
              margin: "0 0 28px 0",
              lineHeight: 1.5,
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
            }}
          >
            Upgrade to unlock detailed insights about your messaging
            performance.
          </p>

          {/* Feature highlights with SVG icons */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "10px",
              marginBottom: "28px",
              textAlign: "left",
            }}
          >
            {/* Message Activity */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#4ade80"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <span
                style={{
                  color: "#b0b0b0",
                  fontSize: "12.5px",
                  fontWeight: 500,
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
                }}
              >
                Message Activity
              </span>
            </div>

            {/* Revenue Analytics */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#60a5fa"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <span
                style={{
                  color: "#b0b0b0",
                  fontSize: "12.5px",
                  fontWeight: 500,
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
                }}
              >
                Revenue Analytics
              </span>
            </div>

            {/* Performance Reports */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#a78bfa"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              <span
                style={{
                  color: "#b0b0b0",
                  fontSize: "12.5px",
                  fontWeight: 500,
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
                }}
              >
                Performance Reports
              </span>
            </div>

            {/* Custom Date Ranges */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                background: "rgba(255,255,255,0.03)",
                borderRadius: "10px",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fbbf24"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span
                style={{
                  color: "#b0b0b0",
                  fontSize: "12.5px",
                  fontWeight: 500,
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
                }}
              >
                Custom Date Ranges
              </span>
            </div>
          </div>

          {/* CTA */}
          <a
            href="/upgrade"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 28px",
              background: "#ffffff",
              color: "#000000",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "8px",
              textDecoration: "none",
              transition: "all 0.2s ease",
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            Upgrade to Business
          </a>
        </div>
      </div>
    );
  }

  // ─── BUSINESS/PRO PLAN: Full analytics view ─────────────────────────
  return (
    <div className={styles.analyticsView}>
      {/* Header */}
      <div className={styles.viewHeader}>
        <div>
          <h1 className={styles.viewTitle}>WhatsApp Analytics</h1>
          <p className={styles.viewSubtitle}>
            Monitor your messaging performance and engagement
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.secondaryBtn}
            onClick={handleRefresh}
            disabled={loading || revenueLoading}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                animation:
                  loading || revenueLoading ? "spin 1s linear infinite" : "none",
              }}
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            Refresh
          </button>
          <AnalyticsDateRangeSelector
            value={selectedRange}
            onChange={setSelectedRange}
            disabled={loading && !analytics}
          />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            background: "#fee2e2",
            border: "1px solid #fca5a5",
            borderRadius: "8px",
            padding: "12px 16px",
            marginBottom: "16px",
            color: "#dc2626",
          }}
        >
          ⚠️ {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: "12px",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Loading State */}
      {loading && !analytics && (
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
          }}
        >
          <LoadingSpinner text="Loading analytics..." />
        </div>
      )}

      {/* Stats Cards */}
      {analytics && (
        <>
          <div className={styles.statsCardsRow}>
            {stats.map((stat) => (
              <div
                key={stat.id}
                className={styles.statsCard}
                style={{ "--card-accent": stat.color } as React.CSSProperties}
              >
                <div
                  className={styles.statsCardIcon}
                  style={{ background: `${stat.color}15`, color: stat.color }}
                >
                  {stat.icon}
                </div>
                <div className={styles.statsCardContent}>
                  <span className={styles.statsCardLabel}>{stat.label}</span>
                  <div className={styles.statsCardValueRow}>
                    <span className={styles.statsCardValue}>{stat.value}</span>
                  </div>
                  <span className={styles.statsCardSubtitle}>
                    {stat.subtitle}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Revenue Analytics Chart (Shop domain) */}
          <RevenueAnalyticsChart
            data={revenueData}
            loading={revenueLoading}
            error={revenueError}
            onRetry={refetchRevenue}
          />

          {/* Trends Chart - Redesigned */}
          {chartData.length > 0 &&
            (() => {
              // Generate Y-axis labels
              const yAxisLabels = [];
              const steps = 4;
              for (let i = steps; i >= 0; i--) {
                const value = Math.round((maxValue / steps) * i);
                let label = value.toString();
                if (value >= 1000) {
                  label =
                    (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1) + "K";
                }
                yAxisLabels.push({ value, label });
              }

              return (
                <div
                  style={{
                    background: "#0a0a0a",
                    borderRadius: "16px",
                    padding: "24px",
                    marginBottom: "24px",
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "24px",
                    }}
                  >
                    <div>
                      <h2
                        style={{
                          fontSize: "18px",
                          fontWeight: 600,
                          color: "#ffffff",
                          margin: 0,
                        }}
                      >
                        Message Activity
                      </h2>
                      <p
                        style={{
                          fontSize: "13px",
                          color: "#6b7280",
                          margin: "4px 0 0 0",
                        }}
                      >
                        Messages sent for {selectedRange.label}
                      </p>
                    </div>
                  </div>

                  {/* Chart Container */}
                  <div
                    style={{
                      display: "flex",
                      gap: "12px",
                    }}
                  >
                    {/* Y-Axis Labels */}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        paddingBottom: "24px",
                        minWidth: "40px",
                        textAlign: "right",
                      }}
                    >
                      {yAxisLabels.map((item, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: "11px",
                            color: "#6b7280",
                          }}
                        >
                          {item.label}
                        </span>
                      ))}
                    </div>

                    {/* Bars Container */}
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      {/* Grid lines and bars */}
                      <div
                        style={{
                          position: "relative",
                          height: "200px",
                          display: "flex",
                          alignItems: "flex-end",
                          gap: "3px",
                        }}
                      >
                        {/* Grid lines */}
                        {yAxisLabels.map((_, idx) => (
                          <div
                            key={idx}
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              bottom: `${
                                (idx / (yAxisLabels.length - 1)) * 100
                              }%`,
                              height: "1px",
                              background: "#1a1a1a",
                              zIndex: 0,
                            }}
                          />
                        ))}

                        {/* Bars */}
                        {chartData.map((value, index) => {
                          const barHeight =
                            maxValue > 0 ? (value / maxValue) * 100 : 0;
                          return (
                            <div
                              key={index}
                              title={`${chartLabels[index]}: ${value} messages`}
                              className="chart-bar-wrapper"
                              style={{
                                flex: 1,
                                position: "relative",
                                zIndex: 1,
                                display: "flex",
                                alignItems: "flex-end",
                                height: "100%",
                              }}
                            >
                              {/* Tooltip */}
                              <div
                                className="chart-tooltip"
                                style={{
                                  position: "absolute",
                                  bottom: `calc(${barHeight}% + 8px)`,
                                  left: "50%",
                                  transform: "translateX(-50%)",
                                  background: "#1f1f1f",
                                  border: "1px solid #333",
                                  borderRadius: "8px",
                                  padding: "8px 12px",
                                  whiteSpace: "nowrap",
                                  opacity: 0,
                                  visibility: "hidden",
                                  transition: "all 0.2s",
                                  zIndex: 100,
                                  pointerEvents: "none",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "12px",
                                    color: "#9ca3af",
                                    marginBottom: "2px",
                                  }}
                                >
                                  {chartLabels[index]}
                                </div>
                                <div
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: 600,
                                    color: "#ffffff",
                                  }}
                                >
                                  {value.toLocaleString()} messages
                                </div>
                              </div>
                              {/* The actual bar */}
                              <div
                                className="chart-bar"
                                style={{
                                  width: "100%",
                                  height: `${barHeight}%`,
                                  minHeight: value > 0 ? "4px" : "0",
                                  background:
                                    "linear-gradient(180deg, #6ee7b7 0%, #22c55e 100%)",
                                  borderRadius: "3px 3px 0 0",
                                  transition: "height 0.3s ease",
                                  cursor: "pointer",
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* X-Axis Labels */}
                      <div
                        style={{
                          display: "flex",
                          gap: "3px",
                          marginTop: "8px",
                        }}
                      >
                        {chartData.map((_, index) => {
                          // Show label only for every Nth bar to avoid crowding
                          const total = chartData.length;
                          const showEvery =
                            total <= 10
                              ? 1
                              : total <= 20
                                ? 2
                                : total <= 31
                                  ? 3
                                  : 7;
                          const showLabel = index % showEvery === 0;
                          return (
                            <div
                              key={index}
                              style={{
                                flex: 1,
                                textAlign: "center",
                                fontSize: "10px",
                                color: "#6b7280",
                                overflow: "hidden",
                              }}
                            >
                              {showLabel ? chartLabels[index] : ""}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
        </>
      )}

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .chart-bar-wrapper:hover .chart-bar {
          background: linear-gradient(
            180deg,
            #a7f3d0 0%,
            #4ade80 100%
          ) !important;
        }
        .chart-bar-wrapper:hover .chart-tooltip {
          opacity: 1 !important;
          visibility: visible !important;
        }
      `}</style>
    </div>
  );
}
