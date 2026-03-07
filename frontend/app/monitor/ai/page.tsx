"use client";

import "./monitor.css";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ============================================================================
// Types
// ============================================================================

interface PlatformOverview {
  total_users: number;
  total_tenants: number;
  total_ai_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_ai_cost_usd: number;
  total_ai_cost_inr: number;
  total_ai_replies: number;
  total_messages_sent: number;
  total_messages_received: number;
  cost_per_model: Record<
    string,
    { tokens: number; cost_usd: number; replies: number }
  >;
  monthly_cost_estimate_usd: number;
  daily_cost_estimate_usd: number;
  generated_at: string;
}

interface TenantUsage {
  business_name: string;
  industry: string;
  email: string;
  plan: string;
  subscription_status: string;
  ai_tokens: number;
  ai_replies: number;
  ai_cost_usd: number;
  ai_cost_inr: number;
  input_tokens: number;
  output_tokens: number;
  model: string;
  created_at: string;
}

interface DailyTrend {
  date: string;
  messages_sent: number;
  messages_received: number;
  ai_replies: number;
  ai_tokens: number;
  ai_cost_usd: number;
}

interface ModelBreakdown {
  model: string;
  total_tokens: number;
  total_cost_usd: number;
  total_replies: number;
  tenant_count: number;
  avg_cost_per_reply: number;
}

interface MonitorData {
  platform: PlatformOverview;
  tenants: TenantUsage[];
  tenants_total: number;
  trends: DailyTrend[];
  models: ModelBreakdown[];
}

// ============================================================================
// Chart colors
// ============================================================================

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
];

// ============================================================================
// Formatters
// ============================================================================

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatUSD(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatINR(n: number): string {
  return `₹${n.toFixed(2)}`;
}

// ============================================================================
// Main Component
// ============================================================================

export default function MonitorAIPage() {
  const router = useRouter();
  const [adminKey, setAdminKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<MonitorData | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Tenant table state
  const [sortBy, setSortBy] = useState("ai_cost");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchQuery, setSearchQuery] = useState("");

  // Check localStorage/sessionStorage for saved key — redirect to login if none
  useEffect(() => {
    const saved =
      localStorage.getItem("monitor_admin_key") ||
      sessionStorage.getItem("monitor_admin_key");
    if (saved) {
      setAdminKey(saved);
      setAuthenticated(true);
    } else {
      // No key found — redirect to login page
      router.replace("/monitor/login");
    }
  }, [router]);

  // Auto-fetch when authenticated
  useEffect(() => {
    if (authenticated && adminKey) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const fetchData = useCallback(async () => {
    if (!adminKey) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/monitor/ai", {
        headers: { "X-Monitor-Key": adminKey },
      });

      if (res.status === 401) {
        setError("Invalid admin key");
        setAuthenticated(false);
        localStorage.removeItem("monitor_admin_key");
        setLoading(false);
        return;
      }

      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Failed to fetch monitoring data");
        setLoading(false);
        return;
      }

      setData(json as MonitorData);
      setLastRefresh(new Date());
    } catch (err) {
      setError("Failed to connect to monitoring service");
    }
    setLoading(false);
  }, [adminKey]);

  const handleLogout = () => {
    localStorage.removeItem("monitor_admin_key");
    sessionStorage.removeItem("monitor_admin_key");
    setAdminKey("");
    setAuthenticated(false);
    setData(null);
    router.replace("/monitor/login");
  };

  // Sort tenants
  const sortedTenants = data?.tenants
    ? [...data.tenants]
        .filter((t) => {
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return (
            t.business_name?.toLowerCase().includes(q) ||
            t.email?.toLowerCase().includes(q) ||
            t.plan?.toLowerCase().includes(q)
          );
        })
        .sort((a, b) => {
          const key = sortBy as keyof TenantUsage;
          const av = a[key] ?? 0;
          const bv = b[key] ?? 0;
          if (typeof av === "string" && typeof bv === "string") {
            return sortOrder === "asc"
              ? av.localeCompare(bv)
              : bv.localeCompare(av);
          }
          return sortOrder === "asc"
            ? (av as number) - (bv as number)
            : (bv as number) - (av as number);
        })
    : [];

  // ============================================================================
  // Redirect to /monitor/login if not authenticated
  // ============================================================================

  if (!authenticated) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p style={{ color: "#b0b0b0", marginTop: 16 }}>
          Redirecting to login...
        </p>
      </div>
    );
  }

  // ============================================================================
  // Dashboard
  // ============================================================================

  const platform = data?.platform;

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.headerTitle}>Platform Monitor</h1>
          {lastRefresh && (
            <span style={styles.headerMeta}>
              Last refresh: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div style={styles.headerRight}>
          <button
            onClick={fetchData}
            disabled={loading}
            style={styles.refreshBtn}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button onClick={handleLogout} style={styles.logoutBtn}>
            Logout
          </button>
        </div>
      </header>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {loading && !data ? (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <p style={{ color: "#b0b0b0", marginTop: 16 }}>
            Loading platform metrics...
          </p>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          {platform && (
            <div style={styles.statsGrid}>
              <StatCard
                label="Total Users"
                value={formatNumber(platform.total_users)}
                icon="users"
                color="#3b82f6"
              />
              <StatCard
                label="Total Tenants"
                value={formatNumber(platform.total_tenants)}
                icon="building"
                color="#10b981"
              />
              <StatCard
                label="AI Tokens Used"
                value={formatNumber(platform.total_ai_tokens)}
                icon="cpu"
                color="#f59e0b"
                subtitle={`${formatNumber(platform.total_ai_replies)} replies`}
              />
              <StatCard
                label="AI Cost (USD)"
                value={formatUSD(platform.total_ai_cost_usd)}
                icon="dollar"
                color="#ef4444"
                subtitle={formatINR(platform.total_ai_cost_inr)}
              />
              <StatCard
                label="Messages Sent"
                value={formatNumber(platform.total_messages_sent)}
                icon="send"
                color="#8b5cf6"
                subtitle="Last 30 days"
              />
              <StatCard
                label="Daily Cost Est."
                value={formatUSD(platform.daily_cost_estimate_usd)}
                icon="trend"
                color="#ec4899"
                subtitle={`Monthly: ${formatUSD(platform.monthly_cost_estimate_usd)}`}
              />
            </div>
          )}

          {/* Charts Row */}
          <div style={styles.chartsRow}>
            {/* AI Tokens Trend */}
            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>AI Tokens per Day</h3>
              {data?.trends && data.trends.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart
                    data={data.trends}
                    margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="tokenGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#3b82f6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#3b82f6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.06)"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#808080", fontSize: 11 }}
                      tickFormatter={(v) => v.slice(5)}
                      scale="point"
                      padding={{ left: 60, right: 20 }}
                    />
                    <YAxis
                      tick={{ fill: "#808080", fontSize: 11 }}
                      tickFormatter={(v) => formatNumber(v)}
                    />
                    <Tooltip
                      contentStyle={styles.tooltipStyle}
                      formatter={(v: any) => [formatNumber(v), "Tokens"]}
                      labelFormatter={(l) => `Date: ${l}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="ai_tokens"
                      stroke="#3b82f6"
                      fill="url(#tokenGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={styles.noData}>No trend data available</div>
              )}
            </div>

            {/* AI Cost Trend */}
            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>AI Cost per Day (USD)</h3>
              {data?.trends && data.trends.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={data.trends}
                    margin={{ top: 10, right: 20, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.06)"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#808080", fontSize: 11 }}
                      tickFormatter={(v) => v.slice(5)}
                      padding={{ left: 15, right: 15 }}
                    />
                    <YAxis
                      tick={{ fill: "#808080", fontSize: 11 }}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={styles.tooltipStyle}
                      formatter={(v: any) => [formatUSD(v), "Cost"]}
                      labelFormatter={(l) => `Date: ${l}`}
                    />
                    <Bar
                      dataKey="ai_cost_usd"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={styles.noData}>No trend data available</div>
              )}
            </div>
          </div>

          {/* Model Breakdown + Messages Trend */}
          <div style={styles.chartsRow}>
            {/* Model Breakdown Pie */}
            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>Cost by AI Model</h3>
              {data?.models && data.models.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 32,
                    padding: "16px 0",
                  }}
                >
                  <ResponsiveContainer width="50%" height={220}>
                    <PieChart>
                      <Pie
                        data={data.models}
                        dataKey="total_cost_usd"
                        nameKey="model"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                        strokeWidth={0}
                      >
                        {data.models.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={styles.tooltipStyle}
                        formatter={(v: any) => [formatUSD(v), "Cost"]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1 }}>
                    {data.models.map((m, i) => (
                      <div key={m.model} style={styles.legendItem}>
                        <span
                          style={{
                            ...styles.legendDot,
                            backgroundColor: COLORS[i % COLORS.length],
                          }}
                        />
                        <span style={styles.legendLabel}>{m.model}</span>
                        <span style={styles.legendValue}>
                          {formatUSD(m.total_cost_usd)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={styles.noData}>No model data</div>
              )}
            </div>

            {/* Messages Trend */}
            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>Messages per Day</h3>
              {data?.trends && data.trends.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart
                    data={data.trends}
                    margin={{ top: 10, right: 20, left: 20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="msgGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#8b5cf6"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#8b5cf6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.06)"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#808080", fontSize: 11 }}
                      tickFormatter={(v) => v.slice(5)}
                      padding={{ left: 20, right: 15 }}
                    />
                    <YAxis
                      tick={{ fill: "#808080", fontSize: 11 }}
                      tickFormatter={(v) => formatNumber(v)}
                    />
                    <Tooltip
                      contentStyle={styles.tooltipStyle}
                      formatter={(v: any) => [formatNumber(v)]}
                      labelFormatter={(l) => `Date: ${l}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="messages_sent"
                      stroke="#8b5cf6"
                      fill="url(#msgGradient)"
                      strokeWidth={2}
                      name="Sent"
                    />
                    <Area
                      type="monotone"
                      dataKey="ai_replies"
                      stroke="#f59e0b"
                      fill="none"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name="AI Replies"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div style={styles.noData}>No trend data available</div>
              )}
            </div>
          </div>

          {/* Tenant Usage Table */}
          <div style={styles.tableCard}>
            <div style={styles.tableHeader}>
              <h3 style={styles.chartTitle}>Tenant Usage</h3>
              <input
                type="text"
                placeholder="Search tenants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={styles.searchInput}
              />
            </div>

            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <colgroup>
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "12%" }} />
                </colgroup>
                <thead>
                  <tr>
                    {(
                      [
                        {
                          key: "business_name",
                          label: "Tenant",
                          align: "left",
                        },
                        { key: "plan", label: "Plan", align: "left" },
                        { key: "email", label: "Email", align: "left" },
                        { key: "ai_tokens", label: "Tokens", align: "right" },
                        { key: "ai_replies", label: "Replies", align: "right" },
                        {
                          key: "ai_cost_usd",
                          label: "AI Cost",
                          align: "right",
                        },
                        { key: "model", label: "Model", align: "left" },
                        { key: "created_at", label: "Created", align: "left" },
                      ] as {
                        key: string;
                        label: string;
                        align: "left" | "right";
                      }[]
                    ).map((col) => (
                      <th
                        key={col.key}
                        style={{
                          ...styles.th,
                          textAlign: col.align,
                          paddingRight: col.align === "right" ? 40 : 20,
                        }}
                        onClick={() => {
                          if (sortBy === col.key) {
                            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                          } else {
                            setSortBy(col.key);
                            setSortOrder("desc");
                          }
                        }}
                      >
                        {col.label}
                        {sortBy === col.key && (
                          <span style={{ marginLeft: 4, opacity: 0.6 }}>
                            {sortOrder === "asc" ? "↑" : "↓"}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedTenants.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={styles.tdEmpty}>
                        {searchQuery ? "No matching tenants" : "No tenant data"}
                      </td>
                    </tr>
                  ) : (
                    sortedTenants.map((t, i) => (
                      <tr key={i} style={styles.tr}>
                        <td style={styles.td}>
                          <div style={{ fontWeight: 500 }}>
                            {t.business_name || "—"}
                          </div>
                          {t.industry && (
                            <div
                              style={{
                                fontSize: 11,
                                color: "#808080",
                                marginTop: 2,
                              }}
                            >
                              {t.industry}
                            </div>
                          )}
                        </td>
                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.planBadge,
                              backgroundColor:
                                t.plan?.toLowerCase() === "pro"
                                  ? "rgba(139,92,246,0.15)"
                                  : t.plan?.toLowerCase() === "business"
                                    ? "rgba(59,130,246,0.15)"
                                    : t.plan?.toLowerCase() === "growth"
                                      ? "rgba(16,185,129,0.15)"
                                      : "rgba(255,255,255,0.08)",
                              color:
                                t.plan?.toLowerCase() === "pro"
                                  ? "#a78bfa"
                                  : t.plan?.toLowerCase() === "business"
                                    ? "#60a5fa"
                                    : t.plan?.toLowerCase() === "growth"
                                      ? "#34d399"
                                      : "#b0b0b0",
                            }}
                          >
                            {t.plan || "starter"}
                          </span>
                        </td>
                        <td style={{ ...styles.td, fontSize: 12 }}>
                          {t.email || "—"}
                        </td>
                        <td style={styles.tdRight}>
                          {formatNumber(t.ai_tokens)}
                        </td>
                        <td style={styles.tdRight}>{t.ai_replies}</td>
                        <td style={styles.tdRight}>
                          {formatUSD(t.ai_cost_usd)}
                          <div
                            style={{
                              fontSize: 11,
                              color: "#808080",
                              marginTop: 1,
                            }}
                          >
                            {formatINR(t.ai_cost_inr)}
                          </div>
                        </td>
                        <td style={{ ...styles.td, fontSize: 12 }}>
                          {t.model || "—"}
                        </td>
                        <td style={{ ...styles.td, fontSize: 12 }}>
                          {t.created_at
                            ? new Date(t.created_at).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {data && (
              <div style={styles.tableFooter}>
                Showing {sortedTenants.length} of {data.tenants_total} tenants
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Stat Card Component
// ============================================================================

function StatCard({
  label,
  value,
  icon,
  color,
  subtitle,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
  subtitle?: string;
}) {
  const iconMap: Record<string, React.ReactNode> = {
    users: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    building: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
      >
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4" />
        <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
      </svg>
    ),
    cpu: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
      >
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <rect x="9" y="9" width="6" height="6" />
        <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
      </svg>
    ),
    dollar: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
      >
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    send: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
      >
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    ),
    trend: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
      >
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  };

  return (
    <div style={styles.statCard}>
      <div style={styles.statHeader}>
        <span style={{ opacity: 0.8 }}>{iconMap[icon]}</span>
        <span style={styles.statLabel}>{label}</span>
      </div>
      <div style={styles.statValue}>{value}</div>
      {subtitle && <div style={styles.statSubtitle}>{subtitle}</div>}
    </div>
  );
}

// ============================================================================
// Inline Styles (Dark theme matching dashboard.module.css)
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#000000",
    color: "#ffffff",
    padding: "24px 32px",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 32,
    paddingBottom: 20,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  headerLeft: { display: "flex", alignItems: "baseline", gap: 16 },
  headerTitle: { fontSize: 28, fontWeight: 700, margin: 0 },
  headerMeta: { fontSize: 12, color: "#808080" },
  headerRight: { display: "flex", gap: 8 },
  refreshBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  },
  logoutBtn: {
    padding: "8px 16px",
    borderRadius: 8,
    border: "1px solid rgba(255,68,68,0.3)",
    background: "rgba(255,68,68,0.1)",
    color: "#ff6b6b",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  },

  // Stats Grid
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    marginBottom: 32,
  },
  statCard: {
    background: "#0f0f0f",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: "20px 20px 16px",
  },
  statHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  statLabel: { fontSize: 12, color: "#808080", fontWeight: 500 },
  statValue: { fontSize: 28, fontWeight: 700, letterSpacing: "-0.5px" },
  statSubtitle: { fontSize: 12, color: "#808080", marginTop: 4 },

  // Charts
  chartsRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 24,
  },
  chartCard: {
    background: "#0f0f0f",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 20,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: 600,
    margin: "0 0 16px 0",
    color: "#e0e0e0",
  },
  tooltipStyle: {
    backgroundColor: "#1a1a1a",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    color: "#fff",
    fontSize: 12,
  },
  noData: {
    textAlign: "center" as const,
    color: "#808080",
    padding: 60,
    fontSize: 13,
  },

  // Legend
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 0",
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
  },
  legendLabel: { flex: 1, fontSize: 12, color: "#b0b0b0" },
  legendValue: { fontSize: 12, fontWeight: 600, color: "#fff" },

  // Table
  tableCard: {
    background: "#0f0f0f",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
  },
  tableHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  searchInput: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontSize: 13,
    width: 240,
    outline: "none",
  },
  tableWrapper: {
    overflowX: "auto" as const,
    minWidth: 0,
  },
  table: {
    width: "100%",
    minWidth: 1000,
    borderCollapse: "collapse" as const,
    fontSize: 13,
    tableLayout: "fixed" as const,
  },
  th: {
    textAlign: "left" as const,
    padding: "16px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    color: "#808080",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    cursor: "pointer",
    userSelect: "none" as const,
    whiteSpace: "nowrap" as const,
  },
  tr: { borderBottom: "1px solid rgba(255,255,255,0.04)" },
  td: {
    padding: "16px 20px",
    color: "#e0e0e0",
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
  },
  tdRight: {
    padding: "16px 40px 16px 20px",
    color: "#e0e0e0",
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap" as const,
    overflow: "hidden" as const,
    textOverflow: "ellipsis" as const,
  },
  tdEmpty: {
    padding: 60,
    textAlign: "center" as const,
    color: "#808080",
  },
  tableFooter: {
    marginTop: 12,
    fontSize: 12,
    color: "#808080",
    textAlign: "right" as const,
  },

  // Plan Badge
  planBadge: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 600,
    textTransform: "capitalize" as const,
  },

  // Login styles removed — now handled by /monitor/login page

  // Error
  errorBanner: {
    background: "rgba(255,68,68,0.1)",
    border: "1px solid rgba(255,68,68,0.3)",
    borderRadius: 8,
    padding: "10px 16px",
    color: "#ff6b6b",
    fontSize: 13,
    marginBottom: 16,
  },

  // Loading
  loadingContainer: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    margin: "auto",
    padding: 80,
  },
  spinner: {
    width: 32,
    height: 32,
    border: "3px solid rgba(255,255,255,0.1)",
    borderTopColor: "#3b82f6",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
};
