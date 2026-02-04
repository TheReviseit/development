"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardStats {
  otps_sent_today: number;
  success_rate: number;
  failed_deliveries: number;
  rate_limit_hits: number;
  fraud_blocks: number;
  active_api_keys: number;
}

export default function ConsoleDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/console/dashboard/stats", {
          credentials: "include",
        });

        const data = await response.json();

        if (data.success) {
          setStats(data.stats);
        } else {
          setError("Failed to load dashboard stats");
        }
      } catch (err) {
        console.error("Stats error:", err);
        setError("Unable to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <>
        <header className="console-header">
          <h1 className="console-header-title">Dashboard</h1>
        </header>
        <div className="console-content">
          <div className="console-stats-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="console-stat-card">
                <div className="console-stat-label">Loading...</div>
                <div className="console-stat-value">--</div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="console-header">
        <h1 className="console-header-title">Dashboard</h1>
        <Link
          href="/console/projects"
          className="console-btn console-btn-primary"
          style={{ width: "auto" }}
        >
          Create Project
        </Link>
      </header>

      <div className="console-content">
        {error && <div className="console-error">{error}</div>}

        {stats && (
          <div className="console-stats-grid">
            <div className="console-stat-card">
              <div className="console-stat-label">OTPs Sent Today</div>
              <div className="console-stat-value">
                {stats.otps_sent_today.toLocaleString()}
              </div>
            </div>

            <div className="console-stat-card">
              <div className="console-stat-label">Success Rate</div>
              <div
                className={`console-stat-value ${stats.success_rate >= 95 ? "success" : stats.success_rate >= 80 ? "warning" : "danger"}`}
              >
                {stats.success_rate}%
              </div>
            </div>

            <div className="console-stat-card">
              <div className="console-stat-label">Failed Deliveries</div>
              <div
                className={`console-stat-value ${stats.failed_deliveries > 0 ? "danger" : ""}`}
              >
                {stats.failed_deliveries}
              </div>
            </div>

            <div className="console-stat-card">
              <div className="console-stat-label">Rate Limit Hits</div>
              <div
                className={`console-stat-value ${stats.rate_limit_hits > 10 ? "warning" : ""}`}
              >
                {stats.rate_limit_hits}
              </div>
            </div>

            <div className="console-stat-card">
              <div className="console-stat-label">Fraud Blocks</div>
              <div
                className={`console-stat-value ${stats.fraud_blocks > 0 ? "danger" : ""}`}
              >
                {stats.fraud_blocks}
              </div>
            </div>

            <div className="console-stat-card">
              <div className="console-stat-label">Active API Keys</div>
              <div className="console-stat-value">{stats.active_api_keys}</div>
            </div>
          </div>
        )}

        {/* Quick Start Guide */}
        {stats && stats.otps_sent_today === 0 && (
          <div className="console-empty-state">
            <div className="console-empty-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <h3 className="console-empty-title">
              Ready to send your first OTP?
            </h3>
            <p className="console-empty-desc">
              Create a project, generate an API key, and start sending OTPs in
              minutes.
            </p>
            <Link
              href="/console/projects"
              className="console-btn console-btn-primary"
              style={{ width: "auto", display: "inline-flex" }}
            >
              Create Your First Project
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
