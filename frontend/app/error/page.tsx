"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";

const ERROR_MESSAGES: Record<
  string,
  { title: string; message: string; action: string }
> = {
  WRONG_PORTAL: {
    title: "Wrong Portal",
    message:
      "You're trying to access a section that requires a different account type.",
    action: "Go to the correct login page",
  },
  UNAUTHORIZED: {
    title: "Unauthorized",
    message: "You need to log in to access this page.",
    action: "Log in",
  },
  FORBIDDEN: {
    title: "Access Denied",
    message: "You don't have permission to access this resource.",
    action: "Go back",
  },
  SESSION_EXPIRED: {
    title: "Session Expired",
    message: "Your session has expired. Please log in again.",
    action: "Log in",
  },
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") || "UNAUTHORIZED";
  const expected = searchParams.get("expected");
  const current = searchParams.get("current");

  const errorInfo = ERROR_MESSAGES[code] || ERROR_MESSAGES.UNAUTHORIZED;

  const getRedirectUrl = () => {
    if (expected === "console") return "/console/login";
    if (expected === "normal") return "/login";
    if (current === "console") return "/console";
    if (current === "normal") return "/dashboard";
    return "/login";
  };

  const getButtonText = () => {
    if (code === "WRONG_PORTAL") {
      if (expected === "console") return "Go to Developer Console Login";
      if (expected === "normal") return "Go to App Login";
    }
    return errorInfo.action;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000000",
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "#111111",
          borderRadius: "12px",
          padding: "48px",
          maxWidth: "420px",
          width: "100%",
          textAlign: "center",
          border: "1px solid #333333",
        }}
      >
        {/* Error Icon */}
        <div
          style={{
            width: "64px",
            height: "64px",
            margin: "0 auto 24px",
            borderRadius: "50%",
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#000000"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {code === "WRONG_PORTAL" ? (
              <>
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </>
            )}
          </svg>
        </div>

        {/* Title */}
        <h1
          style={{
            color: "#ffffff",
            fontSize: "24px",
            fontWeight: "600",
            marginBottom: "12px",
          }}
        >
          {errorInfo.title}
        </h1>

        {/* Message */}
        <p
          style={{
            color: "#999999",
            fontSize: "15px",
            lineHeight: "1.6",
            marginBottom: "8px",
          }}
        >
          {errorInfo.message}
        </p>

        {/* Details for WRONG_PORTAL */}
        {code === "WRONG_PORTAL" && expected && current && (
          <p
            style={{
              color: "#666666",
              fontSize: "13px",
              marginBottom: "24px",
            }}
          >
            You&apos;re logged in as a{" "}
            <strong style={{ color: "#ffffff" }}>{current}</strong> user, but
            this page is for{" "}
            <strong style={{ color: "#ffffff" }}>{expected}</strong> users.
          </p>
        )}

        {/* Action Button */}
        <Link
          href={getRedirectUrl()}
          style={{
            display: "inline-block",
            background: "#ffffff",
            color: "#000000",
            padding: "12px 24px",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: "600",
            fontSize: "14px",
            marginTop: "16px",
          }}
        >
          {getButtonText()}
        </Link>

        {/* Secondary Link */}
        {code === "WRONG_PORTAL" && current && (
          <Link
            href={current === "console" ? "/console" : "/dashboard"}
            style={{
              display: "block",
              color: "#666666",
              fontSize: "13px",
              marginTop: "16px",
              textDecoration: "underline",
            }}
          >
            Or go to your{" "}
            {current === "console" ? "Developer Console" : "Dashboard"}
          </Link>
        )}
      </div>
    </div>
  );
}

export default function ErrorPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#000000",
            color: "#ffffff",
          }}
        >
          Loading...
        </div>
      }
    >
      <ErrorContent />
    </Suspense>
  );
}
