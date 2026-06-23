/**
 * ConflictRetryBanner — 409 Conflict Resolution UX (Phase D)
 * ===========================================================
 * Displayed when a subscription mutation (subscribe/upgrade) returns
 * HTTP 409, indicating the user has an existing pending checkout
 * from a previous session that must be resolved first.
 *
 * The user has two options:
 *   1. "Resume" — Continue the existing checkout (opens Razorpay)
 *   2. "Cancel & Retry" — Cancel the stale checkout and start fresh
 *
 * Usage:
 *   {error?.isConflict && (
 *     <ConflictRetryBanner
 *       existingCheckoutId={error.existingCheckoutId}
 *       onResolved={() => mutation.mutate(input)}
 *     />
 *   )}
 */

"use client";

import { useState } from "react";
import { resolveConflict, type MutationError } from "@/app/hooks/useSubscribe";

interface ConflictRetryBannerProps {
  /** Existing checkout ID (required for resume action) */
  existingCheckoutId?: string;
  /** Callback after conflict is resolved */
  onResolved: () => void;
  /** Structured mutation error (from useSubscribe) */
  error?: MutationError;
  /** Domain for cancel-pending fallback */
  domain?: string;
}

export function ConflictRetryBanner({
  existingCheckoutId,
  onResolved,
  error,
  domain,
}: ConflictRetryBannerProps) {
  const [isResolving, setIsResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const handleResume = async () => {
    setIsResolving(true);
    setResolveError(null);
    try {
      if (existingCheckoutId) {
        await resolveConflict(existingCheckoutId, "resume");
      }
      onResolved();
    } catch (e: any) {
      setResolveError(e.message || "Failed to resume checkout");
    } finally {
      setIsResolving(false);
    }
  };

  const handleCancelAndRetry = async () => {
    setIsResolving(true);
    setResolveError(null);
    try {
      if (existingCheckoutId) {
        await resolveConflict(existingCheckoutId, "cancel");
      } else if (domain) {
        // Fallback: cancel all pending subscriptions for domain
        await fetch("/api/billing/cancel-pending", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        });
      }
      onResolved();
    } catch (e: any) {
      setResolveError(e.message || "Failed to cancel stale checkout");
    } finally {
      setIsResolving(false);
    }
  };

  const retryAfter = error?.retryAfterSeconds
    ? `${error.retryAfterSeconds} seconds`
    : "a moment";

  return (
    <div
      role="alert"
      style={{
        border: "1px solid #f59e0b",
        backgroundColor: "#fffbeb",
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <p style={{ fontWeight: 600, color: "#92400e", marginBottom: 8 }}>
        You have an existing checkout in progress
      </p>
      <p style={{ color: "#78350f", fontSize: 14, marginBottom: 12 }}>
        {error?.message ||
          "A previous checkout was not completed. You can resume it or cancel and start fresh."}
      </p>

      {resolveError && (
        <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 8 }}>
          {resolveError}
        </p>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleResume}
          disabled={isResolving}
          style={{
            padding: "8px 16px",
            backgroundColor: "#f59e0b",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: isResolving ? "not-allowed" : "pointer",
            opacity: isResolving ? 0.6 : 1,
          }}
        >
          {isResolving ? "Resolving..." : "Resume Checkout"}
        </button>
        <button
          onClick={handleCancelAndRetry}
          disabled={isResolving}
          style={{
            padding: "8px 16px",
            backgroundColor: "transparent",
            color: "#6b7280",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            cursor: isResolving ? "not-allowed" : "pointer",
            opacity: isResolving ? 0.6 : 1,
          }}
        >
          Cancel & Retry
        </button>
      </div>

      {error?.retryAfterSeconds && (
        <p style={{ color: "#6b7280", fontSize: 12, marginTop: 8 }}>
          Retry suggested after {retryAfter}
        </p>
      )}
    </div>
  );
}
