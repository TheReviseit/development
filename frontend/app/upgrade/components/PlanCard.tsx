"use client";

/**
 * PlanCard — Individual Plan Display with CTA
 * ==========================================
 *
 * Design: Clean white card with black border, professional spacing
 * Features: Current plan badge, recommended badge, pricing display, upgrade button
 */

import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { auth } from "@/src/firebase/firebase";
import {
  generateCheckoutIdempotencyKey,
  generateSubscriptionModifyKey,
  generatePaymentRetryKey,
} from "@/lib/billing/idempotency";

interface Plan {
  plan_slug: string;
  display_name: string;
  amount_paise: number;
  amount_yearly_paise?: number;
  tier_level: number;
  tagline?: string;
  requires_sales_call?: boolean;
  features?: Array<{
    feature_key: string;
    hard_limit?: number | null;
    display: string;
  }>;
  features_json?: string[];
  // Proration fields (attached by backend when user has active subscription)
  proration_charge_paise?: number;
  proration_percentage?: number;
  remaining_days?: number;
  total_period_days?: number;
  unused_credit_paise?: number;
  pay_today_paise?: number;
}

interface PlanCardProps {
  plan: Plan;
  isCurrent: boolean;
  isRecommended: boolean;
  billingCycle: "monthly" | "yearly";
  domain: string;
  onViewDifferences?: () => void;
}

export default function PlanCard({
  plan,
  isCurrent,
  isRecommended,
  billingCycle,
  domain,
  onViewDifferences,
}: PlanCardProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showRetry, setShowRetry] = useState(false);
  const pollStartRef = useRef(0);

  // Track elapsed seconds during checkout polling
  useEffect(() => {
    if (!isProcessing || errorMessage) return;
    pollStartRef.current = Date.now();
    setElapsedSeconds(0);
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - pollStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isProcessing, errorMessage]);

  // Load Razorpay SDK on mount with cleanup and 10s timeout
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).Razorpay) return;

    let mounted = true;
    const timeout = setTimeout(() => {
      if (!mounted) return;
      console.error("[PlanCard] Razorpay SDK load timeout (10s)");
      setErrorMessage("Payment gateway is taking too long to load. Please refresh and try again.");
    }, 10000);

    if (document.getElementById("razorpay-sdk")) {
      const existing = document.getElementById(
        "razorpay-sdk",
      ) as HTMLScriptElement;
      const handler = () => { if (mounted) clearTimeout(timeout); };
      existing.addEventListener("load", handler);
      return () => { existing.removeEventListener("load", handler); clearTimeout(timeout); mounted = false; };
    }

    // Preconnect to Razorpay origins for faster SDK load
    const origins = [
      "https://checkout.razorpay.com",
      "https://api.razorpay.com",
    ];
    for (const origin of origins) {
      if (!document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
        const link = document.createElement("link");
        link.rel = "preconnect";
        link.href = origin;
        document.head.appendChild(link);
      }
    }

    const script = document.createElement("script");
    script.id = "razorpay-sdk";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => { if (mounted) clearTimeout(timeout); };
    script.onerror = () => {
      if (mounted) {
        console.error("[PlanCard] Failed to load Razorpay SDK");
        setErrorMessage("Failed to load payment gateway. Please check your internet and refresh.");
        clearTimeout(timeout);
      }
    };
    document.body.appendChild(script);

    return () => { clearTimeout(timeout); mounted = false; };
  }, []);

  // Calculate display price
  const amountPaise =
    billingCycle === "yearly" && plan.amount_yearly_paise
      ? plan.amount_yearly_paise
      : plan.amount_paise;

  const displayPrice = Math.floor(amountPaise / 100);
  const perMonth =
    billingCycle === "yearly" ? Math.floor(displayPrice / 12) : displayPrice;

  // Proration: if backend attached per-plan proration data, show "pay today" amount
  const hasProration =
    typeof plan.pay_today_paise === "number" && plan.pay_today_paise > 0;
  const payTodayDisplay = hasProration
    ? Math.ceil(plan.pay_today_paise! / 100)
    : null;
  const remainingDays = plan.remaining_days ?? 0;
  const unusedCredit = plan.unused_credit_paise
    ? Math.floor(plan.unused_credit_paise / 100)
    : 0;

  // Upgrade mutation — two paths:
  // 1. Existing subscription (hasProration) → POST /api/billing/change-plan
  //    → creates Razorpay ONE-TIME ORDER for prorated difference
  // 2. New subscription → POST /api/upgrade/checkout (synchronous)
  //    → creates Razorpay SUBSCRIPTION at full plan price

const upgradeMutation = useMutation({
    mutationFn: async () => {
      if (processingRef.current) {
        throw new Error("Already processing a payment");
      }
      processingRef.current = true;

      const user = auth.currentUser;
      if (!user) throw new Error("Not authenticated");

      // Get token with conditional refresh — only force-refresh if expired
      const idToken = await user.getIdToken(false);
      const bearer = `Bearer ${idToken}`;

      // ── Path 1: Prorated upgrade (existing subscription) ──────────
      if (hasProration) {
        const idemKey = await generateSubscriptionModifyKey(user.uid, plan.plan_slug, 'upgrade');
        const res = await fetch("/api/billing/change-plan", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Authorization": bearer,
            "Idempotency-Key": idemKey,
          },
          body: JSON.stringify({ new_plan_slug: plan.plan_slug }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as any).message || "Plan change failed");
        }
        return res.json();
      }

      // ── Path 2: New subscription (async checkout — no blocking) ──
      // POST /api/upgrade/checkout returns immediately with a checkout_id.
      // The background worker creates the Razorpay subscription asynchronously.
      // We poll GET /api/upgrade/checkout-status/<id> until completed (max 60s).
      const checkoutIdemKey = await generateCheckoutIdempotencyKey(user.uid, plan.plan_slug, domain);
      const initRes = await fetch("/api/upgrade/checkout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Authorization": bearer,
          "Idempotency-Key": checkoutIdemKey,
        },
        body: JSON.stringify({
          domain,
          target_plan_slug: plan.plan_slug,
          billing_cycle: billingCycle,
        }),
      });
      if (!initRes.ok) {
        const error = await initRes.json().catch(() => ({}));
        throw new Error((error as any).message || "Upgrade failed");
      }
      const initData = await initRes.json();
      const checkoutId = initData.checkout_id;
      if (!checkoutId) {
        throw new Error("No checkout_id in response");
      }

      // Poll for completion (max 60s — matches worker max execution with 3 retries)
      const pollStart = Date.now();
      const POLL_TIMEOUT = 60000;
      const POLL_INTERVAL = 2000;
      let lastStatus = "initiated";
      while (Date.now() - pollStart < POLL_TIMEOUT) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        const pollRes = await fetch(`/api/upgrade/checkout-status/${checkoutId}`, {
          headers: { "Authorization": bearer },
        });
        if (!pollRes.ok) {
          const err = await pollRes.json().catch(() => ({}));
          throw new Error((err as any).message || "Status check failed");
        }
        const pollData = await pollRes.json();
        lastStatus = pollData.status;
        if (pollData.status === "completed") {
          return pollData;
        }
        if (pollData.status === "failed") {
          throw new Error(pollData.error_message || "Payment setup failed");
        }
      }
      throw new Error(
        `Payment setup timed out (status: ${lastStatus}). Please try again.`
      );
    },
    onMutate: () => {
      setIsProcessing(true);
      setErrorMessage(null);
    },
    onSuccess: async (data) => {
      if (typeof window === "undefined" || !(window as any).Razorpay) {
        console.error("[PlanCard] Razorpay SDK not loaded at checkout time");
        setErrorMessage("Payment gateway failed to load. Please refresh and try again.");
        setIsProcessing(false);
        processingRef.current = false;
        return;
      }

      const bearerUser = auth.currentUser;
      if (!bearerUser) {
        setErrorMessage("Session expired. Please refresh and try again.");
        setIsProcessing(false);
        processingRef.current = false;
        return;
      }
      const idToken = await bearerUser.getIdToken(false);
      const bearer = `Bearer ${idToken}`;

      let options: Record<string, any>;

      if (data.order_id) {
        // ── Razorpay ORDER checkout (prorated one-time payment) ────
        options = {
          key: data.key_id,
          order_id: data.order_id,
          amount: data.amount,
          currency: data.currency || "INR",
          name: "Flowauxi",
          description: `Upgrade to ${plan.display_name} (prorated)`,
          handler: async function (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
          }) {
            try {
              const user = auth.currentUser;
              const idemKey = await generatePaymentRetryKey(
                user?.uid || '', response.razorpay_payment_id
              );
              const verifyRes = await fetch("/api/billing/verify-proration", {
                method: "POST",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": bearer,
                  "Idempotency-Key": idemKey,
                },
                body: JSON.stringify({
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                }),
              });

              if (!verifyRes.ok) {
                const errData = await verifyRes.json().catch(() => ({}));
                console.error("[PlanCard] Proration verification failed:", errData);
                setErrorMessage("Payment succeeded but verification failed. Please contact support.");
                setIsProcessing(false);
                processingRef.current = false;
                sessionStorage.removeItem("flowauxi_upgrade_pending");
                return;
              }
            } catch (err) {
              console.error("[PlanCard] Proration verification network error:", err);
              setErrorMessage("Verification network error. Your payment may have succeeded — please contact support.");
              setIsProcessing(false);
              processingRef.current = false;
              sessionStorage.removeItem("flowauxi_upgrade_pending");
              return;
            }

            processingRef.current = false;
            sessionStorage.removeItem("flowauxi_upgrade_pending");
            window.location.href = "/home?upgrade=success";
          },
          modal: {
            ondismiss: function () {
              setIsProcessing(false);
              processingRef.current = false;
              sessionStorage.removeItem("flowauxi_upgrade_pending");
            },
          },
        };
      } else {
        // ── Razorpay SUBSCRIPTION checkout (full price, new sub) ───
        const razorpaySubId = data.razorpay_subscription_id;
        if (!razorpaySubId) {
          console.error("[PlanCard] No razorpay_subscription_id in checkout response:", data);
          setErrorMessage("Missing subscription ID from server. Please try again.");
          setIsProcessing(false);
          processingRef.current = false;
          return;
        }

        const razorpayKeyId = data.razorpay_key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
        if (!razorpayKeyId) {
          console.error("[PlanCard] Missing Razorpay key ID — no API response value and no env fallback");
          setErrorMessage("Payment gateway configuration error. Please contact support.");
          setIsProcessing(false);
          processingRef.current = false;
          return;
        }

        options = {
          key: razorpayKeyId,
          subscription_id: razorpaySubId,
          name: "Flowauxi",
          description: `${plan.display_name} - ${billingCycle}`,
          handler: async function (response: any) {
            try {
              const user = auth.currentUser;
              const idemKey = await generatePaymentRetryKey(
                user?.uid || '', razorpaySubId
              );
              const verifyRes = await fetch("/api/upgrade/verify-payment", {
                method: "POST",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": bearer,
                  "Idempotency-Key": idemKey,
                },
                body: JSON.stringify({
                  razorpay_subscription_id: response.razorpay_subscription_id || razorpaySubId,
                }),
              });

              if (!verifyRes.ok) {
                const errData = await verifyRes.json().catch(() => ({}));
                console.error("[PlanCard] Verify-payment failed:", errData);
                setIsProcessing(false);
                processingRef.current = false;
                sessionStorage.removeItem("flowauxi_upgrade_pending");
                setErrorMessage(errData.message || "Payment verification failed. Please check your payment status.");
                return;
              }
            } catch (err) {
              console.error("[PlanCard] Verify-payment network error:", err);
              setIsProcessing(false);
              processingRef.current = false;
              sessionStorage.removeItem("flowauxi_upgrade_pending");
              setErrorMessage("Payment verification failed. Please check your subscription status.");
              return;
            }

            processingRef.current = false;
            sessionStorage.removeItem("flowauxi_upgrade_pending");
            window.location.href = "/payment-success?source=subscription";
          },
          modal: {
            ondismiss: function () {
              setIsProcessing(false);
              processingRef.current = false;
              sessionStorage.removeItem("flowauxi_upgrade_pending");
            },
          },
        };
      }

      // Defensive guard: never pass undefined/null key to Razorpay SDK
      if (!options.key) {
        console.error("[PlanCard] Razorpay key is missing — aborting checkout open");
        setErrorMessage("Payment gateway configuration error. Please contact support.");
        setIsProcessing(false);
        processingRef.current = false;
        sessionStorage.removeItem("flowauxi_upgrade_pending");
        return;
      }

      // Set pending flag ONLY after Razorpay opens successfully
      try {
        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", function (response: any) {
          const error = response?.error || {};
          console.error("[PlanCard] Razorpay payment failed:", {
            code: error.code,
            description: error.description,
            source: error.source,
            step: error.step,
            reason: error.reason,
          });
          setErrorMessage(
            error.description
              ? `Payment failed: ${error.description}`
              : "Payment failed. Please try a different card or payment method."
          );
          setIsProcessing(false);
          processingRef.current = false;
          sessionStorage.removeItem("flowauxi_upgrade_pending");
        });
        rzp.open();
        sessionStorage.setItem("flowauxi_upgrade_pending", "1");
      } catch (e) {
        console.error("[PlanCard] Failed to open Razorpay checkout:", e);
        setErrorMessage("Failed to open payment window. Please try again.");
        setIsProcessing(false);
        processingRef.current = false;
        sessionStorage.removeItem("flowauxi_upgrade_pending");
      }
    },
    onError: (error: Error) => {
      console.error("[PlanCard] Upgrade mutation error:", error);
      setErrorMessage(error.message);
      setIsProcessing(false);
      processingRef.current = false;
      setShowRetry(true);
    },

  });

  const handleUpgrade = () => {
    if (plan.requires_sales_call) {
      window.location.href = "mailto:sales@flowauxi.com";
      return;
    }

    setShowRetry(false);
    setErrorMessage(null);
    setElapsedSeconds(0);
    processingRef.current = false;
    upgradeMutation.mutate();
  };

  return (
    <div
      className={`
        relative rounded-lg border-2 bg-white p-6 shadow-sm hover:shadow-md transition-shadow duration-200
        ${isCurrent ? "border-black" : "border-gray-200"}
      `}
    >
      {/* Badges */}
      <div className="absolute -top-3 right-4 z-10 flex space-x-2">
        {isRecommended && !isCurrent && (
          <span className="inline-flex px-3 py-1 text-xs font-bold bg-black text-white rounded-full shadow-sm">
            Recommended
          </span>
        )}
      </div>

      {/* Plan Name & Tagline */}
      <div className="mt-4">
        <h3 className="text-xl font-bold text-black">{plan.display_name}</h3>
        {plan.tagline && (
          <p className="mt-1 text-sm text-gray-600">{plan.tagline}</p>
        )}
      </div>

      {/* Pricing */}
      <div className="mt-6">
        {hasProration && !isCurrent ? (
          /* ── Prorated upgrade pricing ────────────────────────── */
          <>
            <div className="flex items-baseline">
              <span className="text-4xl font-bold text-black">
                ₹{payTodayDisplay?.toLocaleString()}
              </span>
              <span className="ml-2 text-gray-500 text-sm">pay today</span>
            </div>
            <p className="mt-1.5 text-xs text-gray-500 leading-snug">
              Prorated for {remainingDays} day{remainingDays !== 1 ? "s" : ""} remaining
              {unusedCredit > 0 && (
                <> · ₹{unusedCredit.toLocaleString()} credit applied</>
              )}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Then ₹{perMonth.toLocaleString()}/mo from next cycle
            </p>
          </>
        ) : (
          /* ── Standard monthly pricing ────────────────────────── */
          <>
            <div className="flex items-baseline">
              <span className="text-4xl font-bold text-black">
                ₹{perMonth.toLocaleString()}
              </span>
              <span className="ml-2 text-gray-600">/month</span>
            </div>
            {billingCycle === "yearly" && (
              <p className="mt-1 text-sm text-gray-600">
                ₹{displayPrice.toLocaleString()} billed annually
              </p>
            )}
          </>
        )}
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{errorMessage}</p>
          {showRetry && (
            <button
              onClick={handleUpgrade}
              className="mt-2 w-full px-3 py-2 text-sm font-semibold bg-black text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Try Again
            </button>
          )}
        </div>
      )}

      {/* CTA Button */}
      <div className="mt-6">
        {isCurrent ? (
          <button
            disabled
            className="w-full px-4 py-3 border-2 border-gray-200 text-sm text-gray-400 font-medium bg-gray-50 rounded-lg cursor-not-allowed"
          >
            Current Plan
          </button>
        ) : (
          <button
            onClick={handleUpgrade}
            disabled={isProcessing}
            className={`
              w-full px-4 py-3 text-sm font-semibold rounded-lg transition-colors duration-200 cursor-pointer
              ${
                plan.requires_sales_call
                  ? "border-2 border-black text-black bg-white hover:bg-gray-50"
                  : "bg-black text-white hover:bg-black"
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {isProcessing ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin h-5 w-5 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Checking... ({elapsedSeconds}s)
              </span>
            ) : plan.requires_sales_call ? (
              "Contact Sales"
            ) : (
              "Upgrade Now"
            )}
          </button>
        )}
      </div>

      {/* Features List */}
      {plan.features_json && plan.features_json.length > 0 && (
        <ul className="mt-6 space-y-3">
          {plan.features_json.slice(0, 5).map((featureText, idx) => (
            <li key={idx} className="flex items-start text-sm">
              <svg
                className="h-5 w-5 text-black mr-2 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span className="text-gray-700">{featureText}</span>
            </li>
          ))}
          {plan.features_json.length > 5 && (
            <li className="text-sm text-gray-600 pl-7">
              +{plan.features_json.length - 5} more features
            </li>
          )}
        </ul>
      )}

      {/* View Differences Link */}
      {onViewDifferences && !isCurrent && (
        <button
          onClick={onViewDifferences}
          className="mt-4 w-full flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 transition-all duration-200"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
          View what changes
        </button>
      )}
    </div>
  );
}
