/**
 * ONBOARDING CLIENT COMPONENTS
 * ==============================
 * Client-side

 interactive components for the onboarding flow.
 * Used by the Server Component page.tsx.
 */

"use client";

import { useState } from "react";
import {
  createSubscriptionWithRetry,
  openRazorpayCheckout,
  verifyPayment,
  clearPaymentRequestId,
} from "@/lib/api/razorpay";
import type { ProductDomain } from "@/lib/product/types";

// =============================================================================
// TYPES
// =============================================================================

type PlanName = "starter" | "business" | "pro";

interface SerializedPlan {
  id: PlanName;
  planId: string; // Unique: "shop_starter"
  name: string;
  price: number;
  priceDisplay: string;
  description: string;
  tagline?: string;
  popular?: boolean;
  features: string[];
}

interface PricingClientProps {
  plans: SerializedPlan[];
  productId: ProductDomain;
  userEmail: string;
  userName?: string;
  userId: string;
}

// =============================================================================
// PRICING CLIENT COMPONENT
// =============================================================================

export function PricingClient({
  plans,
  productId,
  userEmail,
  userName,
  userId,
}: PricingClientProps) {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const handleSelectPlan = async (plan: SerializedPlan) => {
    // Reset stale payment state for fresh idempotency keys
    clearPaymentRequestId();

    setSelectedPlan(plan.planId);
    setPaymentLoading(plan.planId);
    setPaymentError(null);

    try {
      console.log(`[Pricing] Creating subscription for plan: ${plan.planId}`);
      console.log(`[Pricing] Product: ${productId}`);
      console.log(`[Pricing] Amount: ${plan.priceDisplay}`);

      // ✅ Create subscription with plan tier and product context
      const order = await createSubscriptionWithRetry(
        plan.id, // Plan tier: "starter", "business", "pro"
        userEmail,
        userName,
        undefined, // customerPhone
        userId,
        // Domain resolved server-side from Host header — not passed by client
        2, // maxRetries
      );

      console.log("[Pricing] Subscription created:", order.subscription_id);

      // Open Razorpay checkout
      await openRazorpayCheckout({
        subscriptionId: order.subscription_id,
        keyId: order.key_id,
        planName: plan.name,
        amount: order.amount,
        customerEmail: userEmail,
        customerName: userName,
        onSuccess: async (response) => {
          console.log("[Razorpay] Payment successful:", response);

          try {
            // Verify payment
            await verifyPayment(
              {
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              },
              userId,
            );

            console.log("[Pricing] Payment verified successfully");

            // Redirect to dashboard
            window.location.href = "/dashboard";
          } catch (error) {
            console.error("[Pricing] Payment verification failed:", error);
            setPaymentError(
              "Payment verification failed. Please contact support.",
            );
            setPaymentLoading(null);
          }
        },
        onError: (error) => {
          console.error("[Razorpay] Payment error:", error);
          setPaymentError("Payment failed. Please try again.");
          setPaymentLoading(null);
        },
        onClose: () => {
          console.log("[Razorpay] Payment modal dismissed");
          clearPaymentRequestId();
          setPaymentLoading(null);
        },
      });
    } catch (error: any) {
      console.error("[Pricing] Error creating subscription:", error);
      setPaymentError(
        error.message || "Failed to create subscription. Please try again.",
      );
      setPaymentLoading(null);
    }
  };

  return (
    <div className="pricing-section">
      <div className="pricing-header">
        <h2 className="pricing-title">Choose Your Plan</h2>
        <p className="pricing-subtitle">
          Select the perfect plan for your business needs
        </p>
      </div>

      {paymentError && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span className="error-message">{paymentError}</span>
        </div>
      )}

      <div className="pricing-cards-grid">
        {plans.map((plan) => (
          <div
            key={plan.planId}
            className={`pricing-card ${plan.popular ? "popular" : ""} ${
              selectedPlan === plan.planId ? "selected" : ""
            }`}
          >
            {plan.popular && <div className="popular-badge">Most Popular</div>}

            <div className="plan-header">
              <h3 className="plan-name">{plan.name}</h3>
              <div className="plan-price">
                <span className="price-amount">{plan.priceDisplay}</span>
                <span className="price-period">/month</span>
              </div>
              {plan.tagline && <p className="plan-tagline">{plan.tagline}</p>}
              <p className="plan-description">{plan.description}</p>
            </div>

            <ul className="plan-features">
              {plan.features.map((feature, idx) => (
                <li key={idx} className="feature-item">
                  <span className="feature-icon">✓</span>
                  <span className="feature-text">{feature}</span>
                </li>
              ))}
            </ul>

            <button
              className={`plan-select-btn ${
                plan.popular ? "btn-primary" : "btn-secondary"
              }`}
              onClick={() => handleSelectPlan(plan)}
              disabled={paymentLoading === plan.planId}
            >
              {paymentLoading === plan.planId ? (
                <>
                  <span className="spinner"></span>
                  Processing...
                </>
              ) : selectedPlan === plan.planId ? (
                "Selected — Click to Continue"
              ) : (
                `Select ${plan.name}`
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
