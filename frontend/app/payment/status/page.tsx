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
import { Check, X, Lock, AlertCircle, RefreshCcw } from "lucide-react";

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

      if (response.ok && data.processing) {
        return false;
      }

      if (!response.ok && data.error) {
        if (data.error === 'NOT_FOUND') {
          const elapsed = Date.now() - pollStartTime.current;
          if (elapsed >= 30000) {
            setError("Unable to verify your payment. Please try again.");
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
        if (data.error === 'ACTIVATION_FAILED') {
          const elapsed = Date.now() - pollStartTime.current;
          if (elapsed >= 45000) {
            setError(data.message || "Activation is delayed. Please try again in a moment.");
            setLoading(false);
            return true;
          }
          return false;
        }
        setError(data.message || "Payment verification failed.");
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

  // Shared font family configuration mapping directly to the Inter next/font variable
  const interStyle = { fontFamily: "var(--font-inter), sans-serif" };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]" style={interStyle}>
        <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
          <style>{`
            @keyframes spinner-rotate {
              to { transform: rotate(360deg); }
            }
            .spinner-line {
              animation: spinner-rotate 0.8s linear infinite;
            }
          `}</style>
          <div 
            className="spinner-line"
            style={{
              position: 'absolute',
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              border: '2px solid #000000',
              borderTopColor: 'transparent',
              boxSizing: 'border-box'
            }}
          />
          <Lock className="w-8 h-8 text-black" strokeWidth={1.5} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-gray-900 selection:bg-gray-200" style={interStyle}>
      
      {/* Top spacer to push content to middle naturally */}
      <div className="flex-1" />

      <div className="w-full flex justify-center px-4">
        <div className="w-full max-w-sm text-center flex flex-col items-center relative z-10">
          
          {isActive ? (
            <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out w-full">
              {/* Concentric Mint/Green Circles using premium Apple/Stripe success colors */}
              <div 
                className="mb-6"
                style={{
                  width: '96px',
                  height: '96px',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <div 
                  style={{
                    width: '72px',
                    height: '72px',
                    backgroundColor: 'rgba(34, 197, 94, 0.3)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <div 
                    style={{
                      width: '48px',
                      height: '48px',
                      backgroundColor: '#22C55E',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <Check className="w-6 h-6 text-white" strokeWidth={3} />
                  </div>
                </div>
              </div>
              
              <h1 className="text-[22px] font-semibold tracking-tight text-gray-900 mb-2" style={interStyle}>
                Payment Successful!
              </h1>
              <p className="text-gray-500 text-[15px] mb-2 leading-relaxed" style={interStyle}>
                Your Flowauxi subscription is now active
              </p>
            </div>
          ) : isFailed ? (
            <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out w-full">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-[1.25rem] flex items-center justify-center mb-8 shrink-0">
                <X className="w-8 h-8" strokeWidth={2.5} />
              </div>
              <h1 className="text-[22px] font-medium tracking-tight text-gray-900 mb-2" style={interStyle}>Payment failed</h1>
              <p className="text-gray-500 text-[15px] mb-8 px-4 leading-relaxed" style={interStyle}>{error || "We couldn't process your payment."}</p>
              <button 
                className="w-full bg-black text-white py-3.5 px-4 rounded-xl font-medium text-[15px] cursor-pointer mb-6"
                style={interStyle}
                onClick={handleRetry}
              >
                Try again
              </button>
              <p className="text-gray-400 text-[13px]" style={interStyle}>
                Need help? Contact us at <a href="mailto:support@flowauxi.com" className="text-black underline cursor-pointer" style={interStyle}>support@flowauxi.com</a>
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out w-full">
              <div className="w-16 h-16 text-black flex items-center justify-center mb-8 shrink-0">
                <AlertCircle className="w-8 h-8" strokeWidth={1.5} />
              </div>
              <h1 className="text-[22px] font-medium tracking-tight text-gray-900 mb-2" style={interStyle}>Verification error</h1>
              <p className="text-gray-500 text-[15px] mb-8 px-4 leading-relaxed" style={interStyle}>{error}</p>
              <button 
                className="w-full bg-black text-white py-3.5 px-4 rounded-xl font-medium text-[15px] cursor-pointer mb-6"
                style={interStyle}
                onClick={handleRetry}
              >
                Return to upgrade
              </button>
              <p className="text-gray-400 text-[13px]" style={interStyle}>
                Need help? Contact us at <a href="mailto:support@flowauxi.com" className="text-black underline cursor-pointer" style={interStyle}>support@flowauxi.com</a>
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center animate-in fade-in duration-700 w-full">
              <div className="relative w-20 h-20 mb-8 flex items-center justify-center shrink-0">
                {showManualRefresh ? (
                  <RefreshCcw className="w-8 h-8 text-gray-400" />
                ) : (
                  <>
                    <style>{`
                      @keyframes spinner-rotate {
                        to { transform: rotate(360deg); }
                      }
                      .spinner-line {
                        animation: spinner-rotate 0.8s linear infinite;
                      }
                    `}</style>
                    <div 
                      className="spinner-line"
                      style={{
                        position: 'absolute',
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        border: '2px solid #000000',
                        borderTopColor: 'transparent',
                        boxSizing: 'border-box'
                      }}
                    />
                    <Lock className="w-8 h-8 text-black" strokeWidth={1.5} />
                  </>
                )}
              </div>
              
              <h1 className="text-[22px] font-medium tracking-tight text-gray-900 mb-3" style={interStyle}>
                {showManualRefresh ? "Taking longer than usual" : "Confirming payment"}
              </h1>
              <p className="text-gray-400 text-[15px] mb-8 leading-relaxed max-w-[280px] mx-auto" style={interStyle}>
                {showManualRefresh
                  ? "Your payment is taking extra time to verify. You can check again or contact support."
                  : "Please don't close this window while we securely verify your transaction."}
              </p>
              
              {showManualRefresh && (
                <>
                  <button 
                    className="w-full bg-black text-white py-3.5 px-4 rounded-xl font-medium text-[15px] cursor-pointer mb-6"
                    style={interStyle}
                    onClick={handleManualRefresh}
                  >
                    Check status again
                  </button>
                  <p className="text-gray-400 text-[13px]" style={interStyle}>
                    Need help? Contact us at <a href="mailto:support@flowauxi.com" className="text-black underline cursor-pointer" style={interStyle}>support@flowauxi.com</a>
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom spacer to keep content vertically centered */}
      <div className="flex-1" />

      {/* Footer text properly constrained to the bottom */}
      <div className="w-full flex justify-center pb-8 opacity-40 hover:opacity-100 transition-opacity duration-300">
        <p className="text-[11px] font-medium uppercase tracking-widest text-gray-500" style={interStyle}>Secure Environment</p>
      </div>

    </div>
  );
}

export default function PaymentStatusPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
          <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
            <style>{`
              @keyframes spinner-rotate {
                to { transform: rotate(360deg); }
              }
              .spinner-line {
                animation: spinner-rotate 0.8s linear infinite;
              }
            `}</style>
            <div 
              className="spinner-line"
              style={{
                position: 'absolute',
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                border: '2px solid #000000',
                borderTopColor: 'transparent',
                boxSizing: 'border-box'
              }}
            />
            <Lock className="w-8 h-8 text-black" strokeWidth={1.5} />
          </div>
        </div>
      }
    >
      <PaymentStatusContent />
    </Suspense>
  );
}
