"use client";

/**
 * Dashboard Error Boundary
 *
 * Catches React rendering errors in the dashboard route tree.
 * Prevents full page crashes — shows recovery UI instead.
 */

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service in production
    console.error("[Dashboard Error Boundary]", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "2rem",
        fontFamily: "var(--font-jakarta), system-ui, sans-serif",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
          borderRadius: "16px",
          padding: "3rem",
          maxWidth: "480px",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div>
        <h2
          style={{
            color: "#fff",
            fontSize: "1.5rem",
            margin: "0 0 0.75rem",
          }}
        >
          Something went wrong
        </h2>
        <p
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: "0.95rem",
            lineHeight: 1.6,
            margin: "0 0 1.5rem",
          }}
        >
          An unexpected error occurred in the dashboard. Your data is safe.
        </p>
        {error.digest && (
          <p
            style={{
              color: "rgba(255,255,255,0.3)",
              fontSize: "0.75rem",
              fontFamily: "monospace",
              margin: "0 0 1.5rem",
            }}
          >
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            background: "linear-gradient(135deg, #22C15A, #1aa34a)",
            color: "#fff",
            border: "none",
            borderRadius: "10px",
            padding: "0.75rem 2rem",
            fontSize: "1rem",
            fontWeight: 600,
            cursor: "pointer",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 8px 24px rgba(34,193,90,0.4)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
