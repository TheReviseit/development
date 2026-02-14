"use client";

import React, { useState, useMemo } from "react";
import styles from "./PricingCards.module.css";
import {
  createSubscription,
  openRazorpayCheckout,
  verifyPayment,
  clearPaymentRequestId,
} from "../../../lib/api/razorpay";
import { getPricingForDomain } from "../../../lib/pricing/pricing-engine";
import { detectCurrentDomain } from "../../../lib/pricing/domain-detection";
import {
  logger,
  trackFunnelStep,
  perfMonitor,
} from "../../../lib/observability/observability";
import { razorpayCircuitBreaker } from "../../../lib/reliability/circuit-breaker";
import type { ProductDomain } from "../../../lib/domain/config";
import type { PlanTier } from "../../../lib/pricing/pricing-config";

interface PricingCardsProps {
  userEmail?: string;
  userName?: string;
  userPhone?: string;
  userId?: string;
  onSubscriptionSuccess?: (planName: string) => void;
  domain?: ProductDomain; // NEW: Domain for pricing
}

type PlanName = PlanTier;

export default function PricingCards({
  userEmail,
  userName,
  userPhone,
  userId,
  onSubscriptionSuccess,
  domain: propDomain,
}: PricingCardsProps) {
  const [isLoading, setIsLoading] = useState<PlanName | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Detect domain or use provided one
  const domain = propDomain || detectCurrentDomain();

  // Load pricing for the current domain
  const pricingConfig = useMemo(() => getPricingForDomain(domain), [domain]);

  // Track pricing page view (observability)
  useMemo(() => {
    trackFunnelStep("pricing_viewed", { domain });
    logger.info("pricing.page_loaded", {
      domain,
      planCount: pricingConfig.plans.length,
    });
  }, [domain, pricingConfig.plans.length]);

  const handleSubscribe = async (planName: PlanName) => {
    // Track plan selection
    trackFunnelStep("plan_selected", { domain, plan: planName });
    logger.info("pricing.plan_selected", { domain, plan: planName, userId });

    // Check if user is logged in
    if (!userEmail) {
      logger.warn("pricing.auth_required", { domain, plan: planName });
      window.location.href = "/login?redirect=/pricing";
      return;
    }

    // Reset stale payment state for fresh idempotency keys
    clearPaymentRequestId();

    setIsLoading(planName);
    setError(null);

    // Start performance monitoring
    perfMonitor.startTimer("create_subscription");

    try {
      // Step 1: Create subscription order with circuit breaker
      const order = await razorpayCircuitBreaker.execute(
        () =>
          createSubscription(
            planName,
            userEmail,
            userName,
            userPhone,
            userId,
            // Domain resolved server-side from Host header
          ),
        () => ({
          success: false,
          subscription_id: "",
          key_id: "",
          amount: 0,
          currency: "INR",
          plan_name: planName,
          error:
            "Payment service is temporarily unavailable. Please try again in a moment.",
          error_code: "SERVICE_UNAVAILABLE",
        }),
      );

      perfMonitor.endTimer("create_subscription", {
        success: order.success,
        domain,
        plan: planName,
      });

      if (!order.success) {
        logger.error(
          "pricing.subscription_creation_failed",
          new Error(order.error || "Unknown error"),
          {
            domain,
            plan: planName,
            userId,
            errorCode: order.error_code,
          },
        );
        trackFunnelStep("payment_failed", {
          domain,
          plan: planName,
          error: order.error,
        });
        setError(order.error || "Failed to create subscription");
        setIsLoading(null);
        return;
      }

      // Track payment initiation
      trackFunnelStep("payment_initiated", {
        domain,
        plan: planName,
        amount: order.amount,
      });
      logger.info("pricing.payment_initiated", {
        domain,
        plan: planName,
        subscriptionId: order.subscription_id,
        amount: order.amount,
      });

      // Step 2: Open Razorpay checkout
      await openRazorpayCheckout({
        subscriptionId: order.subscription_id,
        keyId: order.key_id,
        planName: order.plan_name,
        amount: order.amount,
        customerEmail: userEmail,
        customerName: userName,
        customerPhone: userPhone,
        onSuccess: async (response) => {
          // Step 3: Verify payment (sets status to PROCESSING)
          const verification = await verifyPayment(
            {
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
            userId,
          );

          if (verification.success) {
            // Redirect to payment status page (don't trust client-side success)
            // Status page will poll until webhook confirms COMPLETED
            window.location.href = `/payment/status?subscription_id=${response.razorpay_subscription_id}`;
          } else {
            setError(verification.error || "Payment verification failed");
            setIsLoading(null);
          }
        },
        onError: (err) => {
          setError(err.description || "Payment failed. Please try again.");
          setIsLoading(null);
        },
        onClose: () => {
          clearPaymentRequestId();
          setIsLoading(null);
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      logger.error("pricing.subscription_error", error, {
        domain,
        plan: planName,
        userId,
      });
      trackFunnelStep("payment_failed", {
        domain,
        plan: planName,
        error: error.message,
      });
      setError("Something went wrong. Please try again.");
      setIsLoading(null);
      perfMonitor.endTimer("create_subscription", {
        success: false,
        domain,
        plan: planName,
      });
    }
  };

  // Render plan features dynamically
  const renderFeatures = (features: string[]) => {
    return features.map((feature, index) => (
      <li key={index} className={styles.feature}>
        <svg
          className={styles.checkIcon}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span>{feature}</span>
      </li>
    ));
  };

  // Render cards dynamically from pricing config
  const renderPricingCards = () => {
    return pricingConfig.plans.map((plan) => (
      <div
        key={plan.id}
        className={`${styles.card} ${plan.popular ? styles.featured : ""}`}
      >
        {plan.popular && <div className={styles.badge}>Most Popular</div>}

        <div className={styles.cardHeader}>
          <h3 className={styles.planName}>{plan.name}</h3>
          <p className={styles.planDescription}>{plan.description}</p>
        </div>

        <div className={styles.priceContainer}>
          <div className={styles.price}>
            <span className={styles.currency}>₹</span>
            <span className={styles.amount}>
              {plan.price.toLocaleString("en-IN")}
            </span>
            <span className={styles.period}>/mo</span>
          </div>
          {plan.tagline && <p className={styles.overageNote}>{plan.tagline}</p>}
        </div>

        <ul className={styles.featureList}>{renderFeatures(plan.features)}</ul>

        <button
          className={styles.ctaButton}
          onClick={() => handleSubscribe(plan.id)}
          disabled={isLoading !== null}
        >
          {isLoading === plan.id ? (
            <span className={styles.loadingSpinner}>Processing...</span>
          ) : (
            "Get Started"
          )}
        </button>
      </div>
    ));
  };

  return (
    <section id="pricing" className={styles.pricingSection}>
      <div className={styles.container}>
        {/* Section Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Choose Your Perfect Plan</h2>
          <p className={styles.subtitle}>
            {pricingConfig.product.name} - AI-powered automation for Indian
            businesses
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className={styles.errorBanner}>
            <p>{error}</p>
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Pricing Cards Grid - Dynamic from config */}
        <div className={styles.cardsGrid}>{renderPricingCards()}</div>
      </div>
    </section>
  );
}
