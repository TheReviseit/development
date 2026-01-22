/**
 * Payment Status Page
 * ===================
 * Dedicated page for checking payment status with progressive polling backoff.
 *
 * Polling strategy:
 * - Every 2s for first 30s
 * - Every 5s for next 90s (up to 2 min total)
 * - After 2 min: show "Still processing" + manual refresh
 *
 * Status flow:
 * - pending → processing → completed (active)
 * - processing → completed (after webhook confirms)
 */

"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import "./payment-status.css";

type PaymentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "active"
  | "failed"
  | "expired"
  | "cancelled";

interface SubscriptionData {
  id: string;
  razorpay_subscription_id: string;
  plan_name: string;
  status: PaymentStatus;
  ai_responses_limit: number;
  ai_responses_used: number;
  current_period_start: string;
  current_period_end: string;
}

interface StatusCheckResult {
  success: boolean;
  has_subscription: boolean;
  subscription: SubscriptionData | null;
  request_id?: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// Polling configuration
const PHASE_1_INTERVAL = 2000; // 2 seconds
const PHASE_1_DURATION = 30000; // 30 seconds
const PHASE_2_INTERVAL = 5000; // 5 seconds
const PHASE_2_DURATION = 120000; // 2 minutes total
const MAX_POLL_TIME = PHASE_2_DURATION;

export default function PaymentStatusPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showManualRefresh, setShowManualRefresh] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pollStartTime = useRef<number>(Date.now());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Generate stable request ID for frontend tracing
  const requestId = useRef<string>(
    `req_${Math.random().toString(36).substring(2, 10)}`,
  );

  const subscriptionId = searchParams.get("subscription_id");

  /**
   * Fetch subscription status from backend
   */
  const checkStatus = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    try {
      const response = await fetch(`${BACKEND_URL}/api/subscriptions/status`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user.uid,
          "X-Request-Id": requestId.current,
        },
      });

      const data: StatusCheckResult = await response.json();
      setPollCount((c) => c + 1);

      if (data.success && data.subscription) {
        setSubscription(data.subscription);

        const status = data.subscription.status;

        // If completed/active, stop polling and redirect
        if (status === "completed" || status === "active") {
          setLoading(false);
          // Wait 2 seconds to show success state, then redirect
          setTimeout(() => {
            router.push("/dashboard?subscription=success");
          }, 2000);
          return true; // Payment complete
        }

        // If failed/cancelled/expired, stop polling
        if (
          status === "failed" ||
          status === "cancelled" ||
          status === "expired"
        ) {
          setLoading(false);
          return true; // Terminal state
        }

        // Still processing
        return false;
      } else {
        setError("Could not find subscription");
        setLoading(false);
        return true;
      }
    } catch (err) {
      console.error("Error checking payment status:", err);
      // Don't stop polling on network errors
      return false;
    }
  }, [user, router]);

  /**
   * Progressive polling with backoff
   */
  const startPolling = useCallback(() => {
    pollStartTime.current = Date.now();

    const poll = async () => {
      const elapsed = Date.now() - pollStartTime.current;
      setElapsedTime(elapsed);

      // Check if max time exceeded
      if (elapsed >= MAX_POLL_TIME) {
        setShowManualRefresh(true);
        setLoading(false);
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        return;
      }

      const isComplete = await checkStatus();
      if (isComplete) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
        return;
      }

      // Calculate next interval based on phase
      const nextInterval =
        elapsed < PHASE_1_DURATION ? PHASE_1_INTERVAL : PHASE_2_INTERVAL;

      // Clear current and set new interval with potentially different timing
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      pollIntervalRef.current = setInterval(poll, nextInterval);
    };

    // Start immediately
    poll();
  }, [checkStatus]);

  /**
   * Manual refresh handler
   */
  const handleManualRefresh = async () => {
    setLoading(true);
    setShowManualRefresh(false);
    setError(null);
    pollStartTime.current = Date.now();
    startPolling();
  };

  /**
   * Retry payment handler
   */
  const handleRetry = () => {
    router.push("/onboarding-embedded");
  };

  // Auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Start polling when user is available
  useEffect(() => {
    if (user) {
      startPolling();
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [user, startPolling]);

  /**
   * Get status display info
   */
  const getStatusInfo = () => {
    if (!subscription) {
      return {
        icon: "⏳",
        title: "Checking Payment Status...",
        message: "Please wait while we verify your payment.",
        color: "#f59e0b",
      };
    }

    switch (subscription.status) {
      case "completed":
      case "active":
        return {
          icon: "✅",
          title: "Payment Successful!",
          message:
            "Your subscription is now active. Redirecting to dashboard...",
          color: "#22c55e",
        };
      case "processing":
        return {
          icon: "⏳",
          title: "Processing Payment...",
          message:
            "Your payment is being confirmed. This usually takes a few seconds.",
          color: "#3b82f6",
        };
      case "pending":
        return {
          icon: "⏳",
          title: "Payment Pending...",
          message: "Waiting for payment confirmation from your bank.",
          color: "#f59e0b",
        };
      case "failed":
        return {
          icon: "❌",
          title: "Payment Failed",
          message: "Your payment could not be processed. Please try again.",
          color: "#ef4444",
        };
      case "expired":
        return {
          icon: "⏰",
          title: "Session Expired",
          message: "Your payment session has expired. Please try again.",
          color: "#6b7280",
        };
      case "cancelled":
        return {
          icon: "🚫",
          title: "Payment Cancelled",
          message: "Your payment was cancelled.",
          color: "#6b7280",
        };
      default:
        return {
          icon: "⏳",
          title: "Checking Status...",
          message: "Please wait...",
          color: "#6b7280",
        };
    }
  };

  const statusInfo = getStatusInfo();
  const progressPercent = Math.min((elapsedTime / MAX_POLL_TIME) * 100, 100);

  if (!user) {
    return (
      <div className="payment-status-container">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  return (
    <div className="payment-status-container">
      <div className="payment-status-card">
        {/* Status Icon */}
        <div
          className="status-icon"
          style={{ backgroundColor: `${statusInfo.color}20` }}
        >
          <span style={{ fontSize: "48px" }}>{statusInfo.icon}</span>
        </div>

        {/* Status Title */}
        <h1 className="status-title">{statusInfo.title}</h1>
        <p className="status-message">{statusInfo.message}</p>

        {/* Progress Bar (for processing states) */}
        {loading && !showManualRefresh && (
          <div className="progress-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: statusInfo.color,
                }}
              />
            </div>
            <p className="progress-text">
              Checking... ({Math.ceil(elapsedTime / 1000)}s)
            </p>
          </div>
        )}

        {/* Manual Refresh (after 2 min) */}
        {showManualRefresh && (
          <div className="manual-refresh-section">
            <p className="still-processing">
              Payment is still being processed. This may take longer than usual.
            </p>
            <button className="refresh-button" onClick={handleManualRefresh}>
              Check Again
            </button>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="error-section">
            <p className="error-text">{error}</p>
          </div>
        )}

        {/* Retry Button (for failed/expired) */}
        {(subscription?.status === "failed" ||
          subscription?.status === "expired") && (
          <button className="retry-button" onClick={handleRetry}>
            Try Again
          </button>
        )}

        {/* Subscription Details (for success) */}
        {(subscription?.status === "completed" ||
          subscription?.status === "active") && (
          <div className="subscription-details">
            <div className="detail-item">
              <span className="detail-label">Plan</span>
              <span className="detail-value">
                {subscription.plan_name.charAt(0).toUpperCase() +
                  subscription.plan_name.slice(1)}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">AI Responses</span>
              <span className="detail-value">
                {subscription.ai_responses_limit.toLocaleString()} / month
              </span>
            </div>
          </div>
        )}

        {/* Debug Info (development only) */}
        {process.env.NODE_ENV === "development" && (
          <div className="debug-info">
            <small>
              Request ID: {requestId.current} | Polls: {pollCount} |
              Subscription ID: {subscriptionId || "N/A"}
            </small>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="status-footer">
        <p>
          Secure payment by Razorpay • Questions? Contact support@flowauxi.com
        </p>
      </div>
    </div>
  );
}
