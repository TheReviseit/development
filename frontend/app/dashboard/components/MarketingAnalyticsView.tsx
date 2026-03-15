"use client";

import { useState, useEffect, useCallback } from "react";
import styles from "../dashboard.module.css";
import { useAuth } from "@/app/components/auth/AuthProvider";
import { useFeatureGate } from "@/lib/hooks/useFeatureGate";
import { getProductDomainFromBrowser } from "@/lib/domain/client";
import LoadingSpinner from "@/app/components/ui/LoadingSpinner";
import CustomDropdown from "@/app/components/ui/CustomDropdown";

// ── Types ──────────────────────────────────────────────────────

interface MarketingAnalytics {
  period: string;
  campaigns: {
    total: number;
    active: number;
    completed: number;
    draft: number;
    total_recipients: number;
    total_sent: number;
    total_delivered: number;
    total_read: number;
    total_failed: number;
    delivery_rate: number;
    read_rate: number;
  };
  messaging: {
    sent: number;
    received: number;
    delivered: number;
    read: number;
    failed: number;
    delivery_rate: number;
    read_rate: number;
    ai_replies: number;
  };
  contacts: {
    total: number;
    opted_in: number;
    new_in_period: number;
  };
  ai: {
    replies_generated: number;
    tokens_used: number;
    tokens_limit: number;
    tokens_percent: number;
    cost_inr: number;
  };
  trends: {
    dates: string[];
    campaigns_sent: number[];
    messages_sent: number[];
    ai_replies: number[];
  };
  top_campaigns: {
    name: string;
    status: string;
    recipients: number;
    sent: number;
    delivered: number;
    read: number;
    delivery_rate: number;
    read_rate: number;
  }[];
  meta_health: {
    quality: string;
    limit_tier: string;
    business_name?: string;
    phone_number?: string;
    account_status?: string;
    waba_id?: string;
    verification_status?: string;
    account_name?: string;
  };
}

// ── Icon Components ────────────────────────────────────────────

const CampaignIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const DeliveryIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const ContactsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const AIIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a2 2 0 0 1 0 4h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a2 2 0 0 1 0-4h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
  </svg>
);

const SendIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const ReadIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const ReceiveIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const FailedIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

// ── Helpers ────────────────────────────────────────────────────

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}

function getStatusColor(status: string): string {
  switch (status) {
    case "completed": return "#4ade80";
    case "sending": case "active": return "#60a5fa";
    case "draft": return "#6b7280";
    case "failed": return "#f87171";
    case "scheduled": return "#fbbf24";
    default: return "#808080";
  }
}

// ── Main Component ─────────────────────────────────────────────

export default function MarketingAnalyticsView() {
  const { firebaseUser } = useAuth();
  const [data, setData] = useState<MarketingAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"today" | "7d" | "30d" | "80d">("30d");

  const [currentDomain] = useState(() => getProductDomainFromBrowser());

  const { allowed: canAccessAnalytics, isLoading: subLoading } =
    useFeatureGate("advanced_analytics", { domain: currentDomain });

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/analytics/marketing?period=${period}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed with status ${res.status}`);
      }
      const result = await res.json();
      if (!result.success) throw new Error(result.error || "Failed to load");
      setData(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load analytics";
      console.error("Marketing analytics error:", msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (canAccessAnalytics) loadAnalytics();
  }, [loadAnalytics, canAccessAnalytics]);

  // ─── Loading state ───────────────────────────────────────────
  if (subLoading) {
    return (
      <div className={styles.analyticsView}>
        <div className={styles.viewHeader}>
          <div>
            <h1 className={styles.viewTitle}>Marketing Analytics</h1>
            <p className={styles.viewSubtitle}>Campaign performance and engagement insights</p>
          </div>
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <LoadingSpinner text="Loading analytics..." />
        </div>
      </div>
    );
  }

  // ─── Upgrade gate ────────────────────────────────────────────
  if (!canAccessAnalytics) {
    return (
      <div className={styles.analyticsView}>
        <div className={styles.viewHeader}>
          <div>
            <h1 className={styles.viewTitle}>Marketing Analytics</h1>
            <p className={styles.viewSubtitle}>Campaign performance and engagement insights</p>
          </div>
        </div>
        <div style={{
          maxWidth: "480px", margin: "48px auto", background: "#0f0f0f",
          borderRadius: "16px", padding: "40px 36px", textAlign: "center",
          border: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div style={{
            width: "56px", height: "56px", borderRadius: "14px",
            background: "rgba(255,255,255,0.04)", display: "flex",
            alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px", border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#b0b0b0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 style={{ color: "#fff", fontSize: "20px", fontWeight: 600, margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>
            Analytics is a Business feature
          </h2>
          <p style={{ color: "#808080", fontSize: "13px", margin: "0 0 28px 0", lineHeight: 1.5 }}>
            Upgrade to unlock detailed campaign performance, delivery insights, and audience growth metrics.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "28px", textAlign: "left" }}>
            {[
              { label: "Campaign Performance", color: "#4ade80" },
              { label: "Delivery Analytics", color: "#60a5fa" },
              { label: "Audience Growth", color: "#a78bfa" },
              { label: "AI Response Metrics", color: "#fbbf24" },
            ].map((f) => (
              <div key={f.label} style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "10px 14px", background: "rgba(255,255,255,0.03)",
                borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: f.color, flexShrink: 0 }} />
                <span style={{ color: "#b0b0b0", fontSize: "12.5px", fontWeight: 500 }}>{f.label}</span>
              </div>
            ))}
          </div>
          <a href="/upgrade" style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "10px 28px", background: "#fff", color: "#000",
            fontSize: "13px", fontWeight: 600, borderRadius: "8px", textDecoration: "none",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            Upgrade to Business
          </a>
        </div>
      </div>
    );
  }


  // ─── Stats cards ─────────────────────────────────────────────
  const stats = data
    ? [
        {
          id: "campaigns-sent",
          label: "Campaign Messages",
          value: formatNumber(data.campaigns.total_sent),
          subtitle: `${data.campaigns.total} campaigns sent`,
          icon: <CampaignIcon />,
          color: "#60a5fa",
        },
        {
          id: "delivery-rate",
          label: "Delivery Rate",
          value: `${data.campaigns.delivery_rate}%`,
          subtitle: `${formatNumber(data.campaigns.total_delivered)} delivered`,
          icon: <DeliveryIcon />,
          color: "#4ade80",
        },
        {
          id: "contacts",
          label: "Total Contacts",
          value: formatNumber(data.contacts.total),
          subtitle: `${data.contacts.new_in_period} new this period`,
          icon: <ContactsIcon />,
          color: "#a78bfa",
        },
        {
          id: "ai-replies",
          label: "AI Responses",
          value: formatNumber(data.ai.replies_generated),
          subtitle: `${data.ai.tokens_percent}% token usage`,
          icon: <AIIcon />,
          color: "#fbbf24",
        },
      ]
    : [];

  // ─── Main render ─────────────────────────────────────────────
  return (
    <div className={styles.analyticsView} style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Premium Fonts & Global Responsive Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap');
        
        .mkt-stats-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
          margin-bottom: 32px;
        }

        .mkt-layout-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
          margin-bottom: 32px;
        }

        @media (max-width: 1200px) {
          .mkt-stats-row {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 992px) {
          .mkt-layout-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .mkt-stats-row {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .mkt-header-flex {
            flex-direction: column;
            align-items: flex-start !important;
            gap: 24px;
          }
          .mkt-header-actions {
            width: 100%;
            flex-direction: column;
            align-items: stretch !important;
          }
        }
      `}} />

      {/* Header */}
      <div className="mkt-header-flex" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#fff", margin: 0, letterSpacing: "-0.03em" }}>Marketing Intelligence</h1>
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>Premium performance and engagement overview</p>
        </div>
        <div className="mkt-header-actions" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button onClick={loadAnalytics} disabled={loading} style={{
            display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px",
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "12px", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer",
            transition: "all 0.2s"
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: loading ? "spin 1s linear infinite" : "none" }}>
              <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>
          <div style={{ minWidth: "160px" }}>
            <CustomDropdown
              id="period-select"
              value={period}
              options={[
                { value: "today", label: "Today" },
                { value: "7d", label: "A week" },
                { value: "30d", label: "Last 30 days" },
                { value: "80d", label: "Last 80 days" },
              ]}
              onChange={(v) => setPeriod(v as any)}
            />
          </div>
        </div>
      </div>

      {/* Error / Loading */}
      {error && (
        <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "12px", padding: "16px", marginBottom: "24px", color: "#ef4444", display: "flex", justifyContent: "space-between" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontWeight: 600 }}>Dismiss</button>
        </div>
      )}

      {!data && loading ? (
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
          <LoadingSpinner text="Analyzing marketing data..." />
        </div>
      ) : data && (
        <>
          {/* Stats Grid */}
          <div className="mkt-stats-row">
            {stats.map((stat) => (
              <div key={stat.id} style={{
                background: "rgba(10, 10, 10, 0.6)", backdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "24px", padding: "24px",
                display: "flex", flexDirection: "column", gap: "16px", boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)"
              }}>
                <div style={{ color: stat.color, background: `${stat.color}15`, width: "40px", height: "40px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {stat.icon}
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{stat.label}</div>
                  <div style={{ fontSize: "28px", color: "#fff", fontWeight: 800, letterSpacing: "-0.03em" }}>{stat.value}</div>
                  <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginTop: "4px" }}>{stat.subtitle}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mkt-layout-grid">
            {/* Delivery Funnel */}
            <div style={{
              background: "rgba(10, 10, 10, 0.8)", backdropFilter: "blur(20px)",
              borderRadius: "24px", padding: "32px", border: "1px solid rgba(255, 255, 255, 0.06)",
              boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)"
            }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>Campaign Journey</h2>
              <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", margin: "0 0 32px 0" }}>Message conversion flow</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
                {[
                  { label: "Recipients", value: data.campaigns.total_recipients, color: "rgba(255, 255, 255, 1)", barColor: "#fff" },
                  { label: "Sent", value: data.campaigns.total_sent, color: "rgba(96, 165, 250, 1)", barColor: "#60a5fa" },
                  { label: "Delivered", value: data.campaigns.total_delivered, color: "rgba(74, 222, 128, 1)", barColor: "#4ade80" },
                  { label: "Read", value: data.campaigns.total_read, color: "rgba(251, 191, 36, 1)", barColor: "#fbbf24" },
                ].map((step, i, arr) => {
                  const percentage = i === 0 ? 100 : Math.round((step.value / arr[0].value) * 100);
                  const showPercentage = step.value > 0 && i !== 0;
                  
                  return (
                    <div key={step.label}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "10px" }}>
                        <div>
                          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>{step.label}</div>
                          <div style={{ fontSize: "20px", color: "#fff", fontWeight: 800, letterSpacing: "-0.02em" }}>{step.value.toLocaleString()}</div>
                        </div>
                        {showPercentage && (
                          <div style={{ fontSize: "13px", fontWeight: 700, color: step.barColor, background: `${step.barColor}15`, padding: "4px 10px", borderRadius: "8px" }}>{percentage}%</div>
                        )}
                      </div>
                      <div style={{ height: "10px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <div style={{
                          width: `${percentage}%`, height: "100%", background: step.barColor,
                          borderRadius: "10px", boxShadow: `0 0 15px ${step.barColor}30`,
                          transition: "width 1s cubic-bezier(0.16, 1, 0.3, 1)"
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Meta Health */}
              <div style={{ marginTop: "40px", paddingTop: "32px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div style={{
                    width: "48px", height: "48px", borderRadius: "14px",
                    background: data.meta_health?.quality === "GREEN" ? "rgba(74, 222, 128, 0.1)" : data.meta_health?.quality === "YELLOW" ? "rgba(251, 191, 36, 0.1)" : "rgba(248, 113, 113, 0.1)",
                    border: `1px solid ${data.meta_health?.quality === "GREEN" ? "#4ade8030" : data.meta_health?.quality === "YELLOW" ? "#fbbf2430" : "#f8717130"}`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                  }}>
                    <div style={{
                      width: "12px", height: "12px", borderRadius: "50%",
                      background: data.meta_health?.quality === "GREEN" ? "#4ade80" : data.meta_health?.quality === "YELLOW" ? "#fbbf24" : "#f87171",
                      boxShadow: `0 0 15px ${data.meta_health?.quality === "GREEN" ? "#4ade80" : data.meta_health?.quality === "YELLOW" ? "#fbbf24" : "#f87171"}80`
                    }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Verified Business</div>
                    <div style={{ fontSize: "16px", color: "#fff", fontWeight: 800, letterSpacing: "-0.01em" }}>{data.meta_health?.business_name || "Connected Account"}</div>
                    <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", fontWeight: 500 }}>{data.meta_health?.phone_number || "No phone linked"}</div>
                  </div>
                </div>
                
                <div style={{ display: "flex", gap: "24px" }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Status</div>
                    <div style={{ 
                      fontSize: "11px", color: "#4ade80", fontWeight: 700, 
                      background: "rgba(74, 222, 128, 0.1)", padding: "4px 10px", borderRadius: "20px",
                      border: "1px solid rgba(74, 222, 128, 0.2)", display: "inline-block"
                    }}>
                      {data.meta_health?.account_status || "ACTIVE"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Daily Limit</div>
                    <div style={{ fontSize: "20px", color: "#fff", fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                      {data.meta_health?.limit_tier?.replace("TIER_", "") || "250"}
                      <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.3)", marginLeft: "4px", fontWeight: 500 }}>msgs</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Messaging Performance */}
            <div style={{
              background: "rgba(10, 10, 10, 0.8)", backdropFilter: "blur(20px)",
              borderRadius: "24px", padding: "32px", border: "1px solid rgba(255, 255, 255, 0.06)",
              boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)"
            }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>Messaging Performance</h2>
              <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", margin: "0 0 32px 0" }}>Complete message lifecycle overview</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "34px" }}>
                {[
                  { label: "Total Sent", value: data.messaging.sent, icon: <SendIcon />, color: "#fff", barColor: "#fff" },
                  { label: "Delivered", value: data.messaging.delivered, icon: <DeliveryIcon />, color: "#60a5fa", barColor: "#60a5fa" },
                  { label: "Read", value: data.messaging.read, icon: <ReadIcon />, color: "#4ade80", barColor: "#4ade80" },
                  { label: "Received", value: data.messaging.received, icon: <ReceiveIcon />, color: "#a78bfa", barColor: "#a78bfa" },
                  { label: "Failed", value: data.messaging.failed, icon: <FailedIcon />, color: "#f87171", barColor: "#f87171" },
                ].map((item, i, arr) => {
                  // Percentage relative to total sent, except for sent itself
                  const percentage = i === 0 ? 100 : data.messaging.sent > 0 ? Math.round((item.value / data.messaging.sent) * 100) : 0;
                  const showPercentage = i !== 0 && i !== 3 && i !== 4 && item.value > 0; // Only for delivered/read relative to sent and if > 0
                  
                  return (
                    <div key={item.label} style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                      <div style={{ 
                        width: "48px", height: "48px", borderRadius: "14px", 
                        background: `rgba(255,255,255,0.03)`, border: `1px solid rgba(255,255,255,0.08)`,
                        display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                        flexShrink: 0, boxShadow: "0 4px 12px rgba(0,0,0,0.2)"
                      }}>
                        {item.icon}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                          <div>
                            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>{item.label}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                            <span style={{ fontSize: "20px", color: "#fff", fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{item.value.toLocaleString()}</span>
                            {showPercentage && (
                              <span style={{ fontSize: "13px", color: item.barColor, fontWeight: 700, background: `${item.barColor}15`, padding: "2px 8px", borderRadius: "6px" }}>{percentage}%</span>
                            )}
                          </div>
                        </div>
                        <div style={{ height: "8px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.05)" }}>
                          <div style={{
                            width: `${Math.min(percentage, 100)}%`, height: "100%", background: item.barColor,
                            borderRadius: "10px", boxShadow: `0 0 10px ${item.barColor}30`,
                            transition: "width 1s cubic-bezier(0.16, 1, 0.3, 1)"
                          }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Account Intelligence Integrated */}
              <div style={{ marginTop: "40px", paddingTop: "32px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <div>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", margin: 0 }}>Account Intelligence</h3>
                    <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)", margin: "4px 0 0 0" }}>Meta Business profile details</p>
                  </div>
                  <div style={{ 
                    fontSize: "10px", color: data.meta_health?.verification_status === "VERIFIED" ? "#4ade80" : "#fbbf24", 
                    fontWeight: 800, textTransform: "uppercase", background: data.meta_health?.verification_status === "VERIFIED" ? "rgba(74, 222, 128, 0.1)" : "rgba(251, 191, 36, 0.1)",
                    padding: "4px 8px", borderRadius: "6px", border: `1px solid ${data.meta_health?.verification_status === "VERIFIED" ? "#4ade8030" : "#fbbf2430"}`
                  }}>
                    {data.meta_health?.verification_status === "VERIFIED" ? "OFFICIAL" : "UNVERIFIED"}
                  </div>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  {/* 
                  <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>WABA ID</div>
                    <div style={{ fontSize: "12px", color: "#fff", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{data.meta_health?.waba_id || "N/A"}</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Meta Name</div>
                    <div style={{ fontSize: "12px", color: "#fff", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{data.meta_health?.account_name || "Primary"}</div>
                  </div>
                  */}
                </div>
              </div>
            </div>
          </div>

          {/* Leaders Table */}
          {data.top_campaigns.length > 0 && (
            <div style={{
              background: "rgba(10, 10, 10, 0.8)", backdropFilter: "blur(20px)",
              borderRadius: "24px", padding: "32px", border: "1px solid rgba(255, 255, 255, 0.06)",
              boxShadow: "0 10px 40px rgba(0, 0, 0, 0.3)"
            }}>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", margin: "0 0 6px 0", letterSpacing: "-0.01em" }}>Performance Leaders</h2>
              <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)", marginBottom: "32px" }}>Best performing campaigns ranked by volume</p>
              <div style={{ overflowX: "auto", margin: "0 -32px", padding: "0 32px" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 8px" }}>
                  <thead>
                    <tr>
                      {["Campaign", "Status", "Volume", "Engagement"].map(h => (
                        <th key={h} style={{ textAlign: "left", fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.3)", padding: "0 16px 16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_campaigns.map((c, i) => (
                      <tr key={i}>
                        <td style={{ padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: "12px 0 0 12px", border: "1px solid rgba(255,255,255,0.05)", borderRight: "none" }}>
                          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{c.name}</div>
                        </td>
                        <td style={{ padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderLeft: "none", borderRight: "none" }}>
                          <span style={{ fontSize: "10px", fontWeight: 800, textTransform: "uppercase", padding: "4px 8px", borderRadius: "6px", background: c.status === "completed" ? "rgba(74, 222, 128, 0.1)" : "rgba(255,255,255,0.05)", color: c.status === "completed" ? "#4ade80" : "#fff" }}>{c.status}</span>
                        </td>
                        <td style={{ padding: "16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255, 255, 255, 0.05)", borderLeft: "none", borderRight: "none" }}>
                          <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff", fontFamily: "'JetBrains Mono', monospace" }}>{c.sent.toLocaleString()}</div>
                        </td>
                        <td style={{ padding: "16px", background: "rgba(255,255,255,0.02)", borderRadius: "0 12px 12px 0", border: "1px solid rgba(255, 255, 255, 0.05)", borderLeft: "none" }}>
                          <div style={{ fontSize: "14px", fontWeight: 700, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>{c.read_rate}%</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.5); opacity: 0; } 100% { transform: scale(1); opacity: 0; } }
      `}</style>
    </div>
  );
}
