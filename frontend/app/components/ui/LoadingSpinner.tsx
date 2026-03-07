"use client";

import { memo } from "react";

interface LoadingSpinnerProps {
  size?: number;
  text?: string;
}

const LoadingSpinner = memo(({ size = 32, text }: LoadingSpinnerProps) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "16px",
      width: "100%",
      height: "100%",
      minHeight: "300px",
    }}
  >
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: "spin 0.8s linear infinite" }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="#6b7280"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.2"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="#6b7280"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
    {text && (
      <span style={{ color: "#6b7280", fontSize: "14px" }}>{text}</span>
    )}
    <style jsx>{`
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}</style>
  </div>
));

LoadingSpinner.displayName = "LoadingSpinner";

export default LoadingSpinner;
