"use client";

/**
 * Shop Landing Error Boundary
 *
 * Catches React rendering errors on the /shop route.
 * Shows a minimal, branded recovery UI.
 */

import { useEffect } from "react";

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Shop Error Boundary]", error);
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
          background: "linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 100%)",
          borderRadius: "16px",
          padding: "3rem",
          maxWidth: "480px",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🛍️</div>
        <h2
          style={{
            color: "#fff",
            fontSize: "1.5rem",
            margin: "0 0 0.75rem",
          }}
        >
          Page couldn&apos;t load
        </h2>
        <p
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: "0.95rem",
            lineHeight: 1.6,
            margin: "0 0 1.5rem",
          }}
        >
          We&apos;re having trouble loading this page. Please try again.
        </p>
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
          }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
