"use client";

/**
 * PlanCard — Individual Plan Display with CTA
 * ==========================================
 *
 * Design: Clean white card with black border, professional spacing
 * Features: Current plan badge, recommended badge, pricing display, upgrade button
 */

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { auth } from "@/src/firebase/firebase";

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
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  // Load Razorpay SDK on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).Razorpay) {
      setRazorpayLoaded(true);
      return;
    }
    if (document.getElementById("razorpay-sdk")) {
      // Script tag exists but hasn't loaded yet — wait for it
      const existing = document.getElementById(
        "razorpay-sdk",
      ) as HTMLScriptElement;
      existing.addEventListener("load", () => setRazorpayLoaded(true));
      return;
    }
    const script = document.createElement("script");
    script.id = "razorpay-sdk";
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setRazorpayLoaded(true);
    script.onerror = () => console.error("Failed to load Razorpay SDK");
    document.body.appendChild(script);
  }, []);

  // Calculate display price
  const amountPaise =
    billingCycle === "yearly" && plan.amount_yearly_paise
      ? plan.amount_yearly_paise
      : plan.amount_paise;

  const displayPrice = Math.floor(amountPaise / 100);
  const perMonth =
    billingCycle === "yearly" ? Math.floor(displayPrice / 12) : displayPrice;

  // Upgrade mutation
  const upgradeMutation = useMutation({
    mutationFn: async () => {
      // Get Firebase auth user ID
      const user = auth.currentUser;
      if (!user) {
        throw new Error("Not authenticated");
      }

      const res = await fetch("/api/upgrade/checkout", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user.uid, // Send Firebase UID, not JWT token
        },
        body: JSON.stringify({
          domain,
          target_plan_slug: plan.plan_slug,
          billing_cycle: billingCycle,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Upgrade failed");
      }

      return res.json();
    },
    onMutate: () => setIsProcessing(true),
    onSuccess: (data) => {
      // Open Razorpay checkout
      if (typeof window === "undefined" || !(window as any).Razorpay) {
        setIsProcessing(false);
        alert(
          "Payment gateway failed to load. Please refresh the page and try again.",
        );
        return;
      }

      const razorpaySubId = data.razorpay_subscription_id;

      if (!razorpaySubId) {
        setIsProcessing(false);
        alert("Missing subscription ID from server. Please try again.");
        return;
      }

      // Set flag BEFORE opening Razorpay — dashboard reads this on load
      sessionStorage.setItem("flowauxi_upgrade_pending", "1");

      const options = {
        key: data.razorpay_key_id,
        subscription_id: razorpaySubId,
        name: "Flowauxi",
        description: `${plan.display_name} - ${billingCycle}`,
        handler: function () {
          // Redirect to dashboard — backend finds pending upgrade by user_id
          window.location.href = "/dashboard?upgrade=success";
        },
        modal: {
          ondismiss: function () {
            setIsProcessing(false);
            sessionStorage.removeItem("flowauxi_upgrade_pending");
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", function () {
        setIsProcessing(false);
        sessionStorage.removeItem("flowauxi_upgrade_pending");
      });
      rzp.open();
    },
    onError: (error: Error) => {
      setIsProcessing(false);
      alert(error.message);
    },
  });

  const handleUpgrade = () => {
    if (plan.requires_sales_call) {
      window.location.href = "mailto:sales@flowauxi.com";
      return;
    }

    upgradeMutation.mutate();
  };

  return (
    <div
      className={`
        relative rounded-lg border-2 bg-white p-6 shadow-sm hover:shadow-md transition-shadow duration-200
        ${isCurrent ? "border-black" : "border-gray-200"}
        ${isRecommended ? "ring-2 ring-black ring-offset-2" : ""}
      `}
    >
      {/* Badges */}
      <div className="absolute -top-3 left-6 flex space-x-2">
        {isCurrent && (
          <span className="inline-flex px-3 py-1 text-xs font-bold bg-black text-white rounded-full">
            Current Plan
          </span>
        )}
        {isRecommended && !isCurrent && (
          <span className="inline-flex px-3 py-1 text-xs font-bold bg-black text-white rounded-full">
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
      </div>

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
              w-full px-4 py-3 text-sm font-semibold rounded-lg transition-colors duration-200
              ${
                plan.requires_sales_call
                  ? "border-2 border-black text-black bg-white hover:bg-gray-50"
                  : "bg-black text-white hover:bg-gray-800"
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
                Processing...
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
      {plan.features && plan.features.length > 0 && (
        <ul className="mt-6 space-y-3">
          {plan.features.slice(0, 5).map((feature) => (
            <li key={feature.feature_key} className="flex items-start text-sm">
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
              <span className="text-gray-700">{feature.display}</span>
            </li>
          ))}
          {plan.features.length > 5 && (
            <li className="text-sm text-gray-600 pl-7">
              +{plan.features.length - 5} more features
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
