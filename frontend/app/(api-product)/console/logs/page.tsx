"use client";

import React, { useEffect, useState, useCallback } from "react";

// =============================================================================
// Types
// =============================================================================

interface LogEntry {
  request_id: string;
  phone: string;
  email?: string;
  purpose: string;
  status: "pending" | "verified" | "expired";
  delivery_status: "queued" | "sent" | "delivered" | "failed";
  channel: string;
  attempts: number;
  resend_count: number;
  created_at: string;
}

// =============================================================================
// Logs Page
// =============================================================================

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [filters, setFilters] = useState({
    status: "",
    purpose: "",
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "50",
        ...(filters.status && { status: filters.status }),
        ...(filters.purpose && { purpose: filters.purpose }),
      });

      const response = await fetch(`/api/console/logs?${params}`, {
        credentials: "include",
      });
      const data = await response.json();

      if (data.success) {
        setLogs(data.logs || []);
        setHasMore(data.pagination?.has_more || false);
      }
    } catch (err) {
      console.error("Fetch logs error:", err);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getStatusBadge = (status: string) => {
    const classes: Record<string, string> = {
      verified: "success",
      pending: "warning",
      expired: "danger",
    };
    return classes[status] || "neutral";
  };

  const getDeliveryBadge = (status: string) => {
    const classes: Record<string, string> = {
      delivered: "success",
      sent: "info",
      queued: "neutral",
      failed: "danger",
    };
    return classes[status] || "neutral";
  };

  return (
    <>
      <header className="console-header">
        <h1 className="console-header-title">OTP Logs</h1>
      </header>

      <div className="console-content">
        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: 16,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                color: "var(--console-text-muted)",
                fontSize: 12,
              }}
            >
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => {
                setFilters({ ...filters, status: e.target.value });
                setPage(1);
              }}
              style={{
                padding: "8px 16px",
                background: "var(--console-surface)",
                border: "1px solid var(--console-border)",
                borderRadius: 6,
                color: "var(--console-text)",
                fontSize: 14,
              }}
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: 6,
                color: "var(--console-text-muted)",
                fontSize: 12,
              }}
            >
              Purpose
            </label>
            <select
              value={filters.purpose}
              onChange={(e) => {
                setFilters({ ...filters, purpose: e.target.value });
                setPage(1);
              }}
              style={{
                padding: "8px 16px",
                background: "var(--console-surface)",
                border: "1px solid var(--console-border)",
                borderRadius: 6,
                color: "var(--console-text)",
                fontSize: 14,
              }}
            >
              <option value="">All Purposes</option>
              <option value="login">Login</option>
              <option value="signup">Signup</option>
              <option value="password_reset">Password Reset</option>
              <option value="transaction">Transaction</option>
            </select>
          </div>
        </div>

        {/* Logs Table */}
        {loading && page === 1 ? (
          <div style={{ color: "var(--console-text-muted)" }}>
            Loading logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="console-empty-state">
            <div className="console-empty-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                width="64"
                height="64"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <h3 className="console-empty-title">No logs yet</h3>
            <p className="console-empty-desc">
              OTP requests will appear here once you start sending.
            </p>
          </div>
        ) : (
          <>
            <table className="console-table">
              <thead>
                <tr>
                  <th>Request ID</th>
                  <th>Destination</th>
                  <th>Purpose</th>
                  <th>Status</th>
                  <th>Delivery</th>
                  <th>Channel</th>
                  <th>Attempts</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.request_id}>
                    <td>
                      <code
                        style={{
                          fontSize: 12,
                          color: "var(--console-text-muted)",
                        }}
                      >
                        {log.request_id.slice(0, 12)}...
                      </code>
                    </td>
                    <td style={{ fontFamily: "monospace" }}>
                      {log.phone || log.email || "—"}
                    </td>
                    <td>
                      <span className="console-badge info">{log.purpose}</span>
                    </td>
                    <td>
                      <span
                        className={`console-badge ${getStatusBadge(log.status)}`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`console-badge ${getDeliveryBadge(log.delivery_status)}`}
                      >
                        {log.delivery_status}
                      </span>
                    </td>
                    <td style={{ textTransform: "capitalize" }}>
                      {log.channel}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {log.attempts}
                      {log.resend_count > 0 && (
                        <span
                          style={{
                            color: "var(--console-text-dim)",
                            fontSize: 11,
                          }}
                        >
                          {" "}
                          (+{log.resend_count})
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        color: "var(--console-text-muted)",
                        fontSize: 13,
                      }}
                    >
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 12,
                marginTop: 24,
              }}
            >
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  padding: "8px 16px",
                  background: "var(--console-surface)",
                  border: "1px solid var(--console-border)",
                  borderRadius: 6,
                  color:
                    page === 1
                      ? "var(--console-text-dim)"
                      : "var(--console-text)",
                  cursor: page === 1 ? "not-allowed" : "pointer",
                }}
              >
                Previous
              </button>
              <span
                style={{
                  padding: "8px 16px",
                  color: "var(--console-text-muted)",
                }}
              >
                Page {page}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                style={{
                  padding: "8px 16px",
                  background: "var(--console-surface)",
                  border: "1px solid var(--console-border)",
                  borderRadius: 6,
                  color: !hasMore
                    ? "var(--console-text-dim)"
                    : "var(--console-text)",
                  cursor: !hasMore ? "not-allowed" : "pointer",
                }}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
