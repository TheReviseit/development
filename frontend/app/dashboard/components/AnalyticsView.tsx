"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "../dashboard.module.css";
import { useAuth } from "@/app/components/auth/AuthProvider";
import { fetchAnalyticsOverview, AnalyticsOverview } from "@/lib/api/whatsapp";

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

export default function AnalyticsView() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");

  // Use user.id or fallback to development user ID
  // TODO: Remove fallback once auth sync is fixed
  const userId =
    user?.id ||
    process.env.NEXT_PUBLIC_DEV_USER_ID ||
    "7944b72f-2bc1-4cc1-9714-215c2e177b51";

  // Fetch analytics data
  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAnalyticsOverview(userId, period);
      setAnalytics(data);
    } catch (err: any) {
      console.error("Failed to fetch analytics:", err);
      setError(err.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [userId, period]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

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
          id: "sent",
          label: "Messages Sent",
          value: formatNumber(analytics.messages.sent),
          subtitle: "Outbound messages",
          icon: <SendIcon />,
          color: "#4ade80",
        },
        {
          id: "received",
          label: "Messages Received",
          value: formatNumber(analytics.messages.received),
          subtitle: "Inbound messages",
          icon: <DeliveredIcon />,
          color: "#60a5fa",
        },
        {
          id: "read",
          label: "Read Rate",
          value: `${analytics.messages.read_rate}%`,
          subtitle: "Of sent messages",
          icon: <ReadIcon />,
          color: "#a78bfa",
        },
        // {
        //   id: "ai",
        //   label: "AI Replies",
        //   value: formatNumber(analytics.ai.replies_generated),
        //   subtitle: `${formatNumber(analytics.ai.tokens_used)} tokens used`,
        //   icon: <AIIcon />,
        //   color: "#f472b6",
        // },
        {
          id: "conversations",
          label: "Active Conversations",
          value: analytics.conversations.active.toString(),
          subtitle: `${analytics.conversations.started} started`,
          icon: <ConversationIcon />,
          color: "#fbbf24",
        },
      ]
    : [];

  // Get chart data from trends
  const chartData = analytics?.trends.sent || [];
  const chartLabels =
    analytics?.trends.dates.map((d) => {
      const date = new Date(d);
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }) || [];
  const maxValue = Math.max(...chartData, 1);

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
            onClick={loadAnalytics}
            disabled={loading}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{
                animation: loading ? "spin 1s linear infinite" : "none",
              }}
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
            Refresh
          </button>
          <select
            className={styles.periodSelect}
            value={period}
            onChange={(e) => setPeriod(e.target.value as "7d" | "30d" | "90d")}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
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
        <div style={{ textAlign: "center", padding: "60px", color: "#6b7280" }}>
          <div style={{ fontSize: "32px", marginBottom: "16px" }}>📊</div>
          Loading analytics...
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

          {/* AI Usage Card */}
          <div
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              borderRadius: "16px",
              padding: "24px",
              color: "white",
              marginBottom: "24px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "24px",
            }}
          >
            <div>
              <h3
                style={{ fontSize: "14px", opacity: 0.8, marginBottom: "8px" }}
              >
                AI Token Usage
              </h3>
              <div style={{ fontSize: "28px", fontWeight: 700 }}>
                {formatNumber(analytics.ai.tokens_used)} /{" "}
                {formatNumber(analytics.ai.tokens_limit)}
              </div>
              <div
                style={{
                  background: "rgba(255,255,255,0.3)",
                  height: "8px",
                  borderRadius: "4px",
                  marginTop: "12px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    background: "white",
                    height: "100%",
                    width: `${analytics.ai.tokens_percent}%`,
                    borderRadius: "4px",
                  }}
                />
              </div>
              <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "8px" }}>
                {analytics.ai.tokens_percent.toFixed(1)}% used
              </div>
            </div>
            <div>
              <h3
                style={{ fontSize: "14px", opacity: 0.8, marginBottom: "8px" }}
              >
                AI Replies Generated
              </h3>
              <div style={{ fontSize: "28px", fontWeight: 700 }}>
                {analytics.ai.replies_generated}
              </div>
              <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "8px" }}>
                Automated responses
              </div>
            </div>
            <div>
              <h3
                style={{ fontSize: "14px", opacity: 0.8, marginBottom: "8px" }}
              >
                Estimated Cost
              </h3>
              <div style={{ fontSize: "28px", fontWeight: 700 }}>
                ₹{analytics.ai.cost_inr.toFixed(2)}
              </div>
              <div style={{ fontSize: "12px", opacity: 0.8, marginTop: "8px" }}>
                ${analytics.ai.cost_usd.toFixed(4)} USD
              </div>
            </div>
          </div>

          {/* Message Delivery Stats */}
          <div
            style={{
              background: "#f8fafc",
              borderRadius: "16px",
              padding: "24px",
              marginBottom: "24px",
            }}
          >
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 600,
                marginBottom: "16px",
              }}
            >
              Message Delivery
            </h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                gap: "16px",
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  padding: "16px",
                  background: "white",
                  borderRadius: "12px",
                }}
              >
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "#4ade80",
                  }}
                >
                  {analytics.messages.sent}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Sent</div>
              </div>
              <div
                style={{
                  textAlign: "center",
                  padding: "16px",
                  background: "white",
                  borderRadius: "12px",
                }}
              >
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "#60a5fa",
                  }}
                >
                  {analytics.messages.delivered}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>
                  Delivered
                </div>
              </div>
              <div
                style={{
                  textAlign: "center",
                  padding: "16px",
                  background: "white",
                  borderRadius: "12px",
                }}
              >
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "#a78bfa",
                  }}
                >
                  {analytics.messages.read}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Read</div>
              </div>
              <div
                style={{
                  textAlign: "center",
                  padding: "16px",
                  background: "white",
                  borderRadius: "12px",
                }}
              >
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "#f87171",
                  }}
                >
                  {analytics.messages.failed}
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>Failed</div>
              </div>
              <div
                style={{
                  textAlign: "center",
                  padding: "16px",
                  background: "white",
                  borderRadius: "12px",
                }}
              >
                <div
                  style={{
                    fontSize: "24px",
                    fontWeight: 700,
                    color: "#22c55e",
                  }}
                >
                  {analytics.messages.delivery_rate}%
                </div>
                <div style={{ fontSize: "12px", color: "#6b7280" }}>
                  Delivery Rate
                </div>
              </div>
            </div>
          </div>

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
                        Messages sent in the last{" "}
                        {period === "7d" ? "7" : period === "30d" ? "30" : "90"}{" "}
                        days
                      </p>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        background: "#1a1a1a",
                        borderRadius: "8px",
                        padding: "4px",
                        gap: "4px",
                      }}
                    >
                      {["Daily", "Weekly", "Monthly"].map((label) => (
                        <button
                          key={label}
                          style={{
                            padding: "6px 12px",
                            fontSize: "12px",
                            fontWeight: 500,
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                            background:
                              label === "Daily" ? "#2a2a2a" : "transparent",
                            color: label === "Daily" ? "#ffffff" : "#6b7280",
                            transition: "all 0.2s",
                          }}
                        >
                          {label}
                        </button>
                      ))}
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
                        {chartData.map((value, index) => (
                          <div
                            key={index}
                            style={{
                              flex: 1,
                              height: "100%",
                              display: "flex",
                              alignItems: "flex-end",
                              position: "relative",
                              zIndex: 1,
                            }}
                          >
                            <div
                              className="chart-bar"
                              style={{
                                width: "100%",
                                height: `${
                                  maxValue > 0 ? (value / maxValue) * 100 : 0
                                }%`,
                                background:
                                  "linear-gradient(180deg, #e5e5e5 0%, #a3a3a3 100%)",
                                borderRadius: "3px 3px 0 0",
                                minHeight: value > 0 ? "4px" : "0",
                                transition: "height 0.3s ease",
                                cursor: "pointer",
                                position: "relative",
                              }}
                              title={`${chartLabels[index]}: ${value} messages`}
                            >
                              {/* Tooltip */}
                              <div
                                className="chart-tooltip"
                                style={{
                                  position: "absolute",
                                  bottom: "100%",
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
                                  marginBottom: "8px",
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
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* X-Axis Labels */}
                      <div
                        style={{
                          display: "flex",
                          gap: "3px",
                          marginTop: "8px",
                        }}
                      >
                        {chartData.map((_, index) => (
                          <div
                            key={index}
                            style={{
                              flex: 1,
                              textAlign: "center",
                              fontSize: "10px",
                              color: "#6b7280",
                            }}
                          >
                            {index + 1}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* Empty trends state */}
          {chartData.length === 0 && (
            <div
              style={{
                background: "#0a0a0a",
                borderRadius: "16px",
                padding: "48px",
                textAlign: "center",
                color: "#6b7280",
              }}
            >
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>📈</div>
              <h3 style={{ marginBottom: "8px", color: "#fff" }}>
                No trend data yet
              </h3>
              <p>
                Message activity will appear here as you send and receive
                messages.
              </p>
            </div>
          )}
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
        .chart-bar:hover {
          background: linear-gradient(
            180deg,
            #ffffff 0%,
            #d4d4d4 100%
          ) !important;
        }
        .chart-bar:hover .chart-tooltip {
          opacity: 1 !important;
          visibility: visible !important;
        }
      `}</style>
    </div>
  );
}
