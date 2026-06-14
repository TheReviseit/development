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
 *
 * Auth: Uses Firebase Bearer token + /api/upgrade/get-subscription for auth.
 *        Does NOT rely on X-Signed-Context (which may not be available here).
 */

"use client";

import { Suspense, useEffect, useId, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/src/firebase/firebase";
import { invalidateOnboardingCheckCache } from "@/lib/auth/onboarding-check-client";
import "./payment-status.css";

type PaymentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "active"
  | "trialing"
  | "grace_period"
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

// Polling configuration
const PHASE_1_INTERVAL = 2000;
const PHASE_1_DURATION = 30000;
const PHASE_2_INTERVAL = 5000;
const PHASE_2_DURATION = 120000;
const MAX_POLL_TIME = PHASE_2_DURATION;
const MAX_UNSUCCESSFUL_POLLS = 60;

function PaymentStatusContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showManualRefresh, setShowManualRefresh] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pollStartTime = useRef(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);
  const isMountedRef = useRef(true);
  const requestId = useId().replace(/:/g, "");

  const subscriptionId = searchParams.get("subscription_id");

  /**
   * Check subscription status via /api/upgrade/verify-payment (read-like, Bearer auth).
   * Returns { completed: true } when subscription is active, or false to keep polling.
   */
  const checkStatus = async (user: User, bearer: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/upgrade/verify-payment", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Authorization": bearer,
          "X-Request-Id": `ps_${requestId}_${pollCountRef.current}`,
        },
        body: JSON.stringify({
          razorpay_subscription_id: subscriptionId || undefined,
        }),
      });

      const data = await response.json();
      pollCountRef.current += 1;

      if (!isMountedRef.current) return true;

      if (response.ok && data.activated) {
        setLoading(false);
        if (data.subscription) {
          setSubscription({ status: 'active', ...data.subscription } as any);
        }
        invalidateOnboardingCheckCache();
        fetch("/api/onboarding/complete", { method: "POST" }).catch(() => {});
        setTimeout(() => { if (isMountedRef.current) router.push("/home"); }, 2000);
        return true;
      }

      if (!response.ok && data.error) {
        if (data.error === 'NOT_FOUND') {
          const elapsed = Date.now() - pollStartTime.current;
          if (elapsed >= 30000) {
            setError("Your payment could not be verified. Please go back and check your subscription.");
            setLoading(false);
            return true;
          }
          return false;
        }
        if (data.error === 'RAZORPAY_TIMEOUT') {
          return false;
        }
        if (data.error === 'PAYMENT_INCOMPLETE') {
          return false;
        }
        setError(data.message || "Payment verification failed");
        setLoading(false);
        return true;
      }

      return false;
    } catch {
      if (!isMountedRef.current) return true;
      return false;
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    const cleanup = () => { isMountedRef.current = false; };
    return cleanup;
  }, []);

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

  useEffect(() => {
    if (!user) return;

    pollStartTime.current = Date.now();
    let cancelled = false;

    const poll = async () => {
      if (cancelled || !isMountedRef.current) return;

      const elapsed = Date.now() - pollStartTime.current;
      setElapsedTime(elapsed);

      if (elapsed >= MAX_POLL_TIME) {
        setShowManualRefresh(true);
        setLoading(false);
        return;
      }

      if (pollCountRef.current >= MAX_UNSUCCESSFUL_POLLS) {
        setShowManualRefresh(true);
        setLoading(false);
        return;
      }

      let bearer: string;
      try {
        bearer = await user.getIdToken();
      } catch {
        setTimeout(poll, PHASE_1_INTERVAL);
        return;
      }

      const done = await checkStatus(user, `Bearer ${bearer}`);
      if (done || cancelled) return;

      const nextInterval = elapsed < PHASE_1_DURATION ? PHASE_1_INTERVAL : PHASE_2_INTERVAL;
      setTimeout(poll, nextInterval);
    };

    poll();

    return () => { cancelled = true; };
  }, [user, router, subscriptionId, requestId]);

  const handleManualRefresh = () => {
    pollCountRef.current = 0;
    setLoading(true);
    setShowManualRefresh(false);
    setError(null);
    pollStartTime.current = Date.now();
    const user = auth.currentUser;
    if (user) setUser(user);
  };

  const handleRetry = () => {
    router.push("/onboarding-embedded");
  };

  const isActive = subscription?.status === "active" || subscription?.status === "completed";
  const isFailed = subscription?.status === "failed" || subscription?.status === "expired" || subscription?.status === "cancelled";
  const isProcessing = loading && !showManualRefresh && !error && !isActive && !isFailed;

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
        {isActive ? (
          <>
            <div className="status-icon" style={{ backgroundColor: "#22c55e20" }}>
              <span style={{ fontSize: "48px" }}>✅</span>
            </div>
            <h1 className="status-title">Payment Successful!</h1>
            <p className="status-message">Your subscription is now active. Redirecting to dashboard...</p>
            <div className="subscription-details">
              <div className="detail-item">
                <span className="detail-label">Plan</span>
                <span className="detail-value">
                  {(subscription?.plan_name || "Unknown").charAt(0).toUpperCase() +
                   (subscription?.plan_name || "Unknown").slice(1)}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">AI Responses</span>
                <span className="detail-value">
                  {Number(subscription?.ai_responses_limit ?? 0).toLocaleString()} / month
                </span>
              </div>
            </div>
          </>
        ) : isFailed ? (
          <>
            <div className="status-icon" style={{ backgroundColor: "#ef444420" }}>
              <span style={{ fontSize: "48px" }}>❌</span>
            </div>
            <h1 className="status-title">Payment Failed</h1>
            <p className="status-message">{error || "Your payment could not be processed. Please try again."}</p>
            <button className="retry-button" onClick={handleRetry}>Try Again</button>
          </>
        ) : error ? (
          <>
            <div className="status-icon" style={{ backgroundColor: "#ef444420" }}>
              <span style={{ fontSize: "48px" }}>❌</span>
            </div>
            <h1 className="status-title">Verification Error</h1>
            <p className="status-message">{error}</p>
            <button className="retry-button" onClick={handleRetry}>Back to Upgrade</button>
          </>
        ) : (
          <>
            <div className="status-icon" style={{ backgroundColor: "#3b82f620" }}>
              <span style={{ fontSize: "48px" }}>⏳</span>
            </div>
            <h1 className="status-title">
              {showManualRefresh ? "Still Processing..." : "Verifying Payment..."}
            </h1>
            <p className="status-message">
              {showManualRefresh
                ? "Payment is taking longer than expected. You can check again or contact support."
                : "Please wait while we confirm your payment with Razorpay."}
            </p>
            {!showManualRefresh && (
              <div className="progress-container">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${progressPercent}%`, backgroundColor: "#3b82f6" }} />
                </div>
                <p className="progress-text">Checking... ({Math.ceil(elapsedTime / 1000)}s)</p>
              </div>
            )}
            {showManualRefresh && (
              <div className="manual-refresh-section">
                <button className="refresh-button" onClick={handleManualRefresh}>Check Again</button>
              </div>
            )}
          </>
        )}

        {process.env.NODE_ENV === "development" && (
          <div className="debug-info">
            <small>
              Request ID: ps_{requestId} | Polls: {pollCountRef.current} |
              Subscription ID: {subscriptionId || "N/A"}
            </small>
          </div>
        )}
      </div>

      <div className="status-footer">
        <p>Secure payment by Razorpay • Questions? Contact support@flowauxi.com</p>
      </div>
    </div>
  );
}

// Default export wrapper
export default function PaymentStatusPage() {
  return (
    <Suspense
      fallback={
        <div className="payment-status-container">
          <div className="loading-spinner">Loading payment status...</div>
        </div>
      }
    >
      <PaymentStatusContent />
    </Suspense>
  );
}
