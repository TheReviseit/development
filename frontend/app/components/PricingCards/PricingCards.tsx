"use client";

import React, { useState } from "react";
import styles from "./PricingCards.module.css";
import {
  createSubscription,
  openRazorpayCheckout,
  verifyPayment,
} from "../../../lib/api/razorpay";

interface PricingCardsProps {
  userEmail?: string;
  userName?: string;
  userPhone?: string;
  userId?: string;
  onSubscriptionSuccess?: (planName: string) => void;
}

type PlanName = "starter" | "business" | "pro";

export default function PricingCards({
  userEmail,
  userName,
  userPhone,
  userId,
  onSubscriptionSuccess,
}: PricingCardsProps) {
  const [isLoading, setIsLoading] = useState<PlanName | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async (planName: PlanName) => {
    // Check if user is logged in
    if (!userEmail) {
      // Redirect to login or show login modal
      window.location.href = "/login?redirect=/pricing";
      return;
    }

    setIsLoading(planName);
    setError(null);

    try {
      // Step 1: Create subscription order
      const order = await createSubscription(
        planName,
        userEmail,
        userName,
        userPhone,
        userId,
      );

      if (!order.success) {
        setError(order.error || "Failed to create subscription");
        setIsLoading(null);
        return;
      }

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
          // Step 3: Verify payment
          const verification = await verifyPayment(
            {
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            },
            userId,
          );

          if (verification.success) {
            onSubscriptionSuccess?.(planName);
            // Redirect to dashboard
            window.location.href = "/dashboard?subscription=success";
          } else {
            setError(verification.error || "Payment verification failed");
          }
          setIsLoading(null);
        },
        onError: (err) => {
          setError(err.description || "Payment failed. Please try again.");
          setIsLoading(null);
        },
        onClose: () => {
          setIsLoading(null);
        },
      });
    } catch (err) {
      console.error("Subscription error:", err);
      setError("Something went wrong. Please try again.");
      setIsLoading(null);
    }
  };

  return (
    <section id="pricing" className={styles.pricingSection}>
      <div className={styles.container}>
        {/* Section Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>Choose Your Perfect Plan</h2>
          <p className={styles.subtitle}>
            AI-powered WhatsApp automation for Indian businesses. Your AI
            answers customer questions automatically.
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className={styles.errorBanner}>
            <p>{error}</p>
            <button onClick={() => setError(null)}>✕</button>
          </div>
        )}

        {/* Pricing Cards Grid */}
        <div className={styles.cardsGrid}>
          {/* Starter Plan - Basic Automation Only */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.planName}>Starter</h3>
              <p className={styles.planDescription}>
                Perfect for solo entrepreneurs just starting with WhatsApp
                automation.
              </p>
            </div>

            <div className={styles.priceContainer}>
              <div className={styles.price}>
                <span className={styles.currency}>₹</span>
                <span className={styles.amount}>1,499</span>
                <span className={styles.period}>/mo</span>
              </div>
              <p className={styles.overageNote}>Best for 80-100 queries/day</p>
            </div>

            <ul className={styles.featureList}>
              <li className={styles.feature}>
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
                <span>2,500 AI Responses / month</span>
              </li>
              <li className={styles.feature}>
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
                <span>1 WhatsApp Number</span>
              </li>
              <li className={styles.feature}>
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
                <span>Up to 50 FAQs Training</span>
              </li>
              <li className={styles.feature}>
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
                <span>Basic Auto-Replies</span>
              </li>
              <li className={styles.feature}>
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
                <span>Live Chat Dashboard</span>
              </li>
              <li className={styles.feature}>
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
                <span>Email Support</span>
              </li>
            </ul>

            <button
              className={styles.ctaButton}
              onClick={() => handleSubscribe("starter")}
              disabled={isLoading !== null}
            >
              {isLoading === "starter" ? (
                <span className={styles.loadingSpinner}>Processing...</span>
              ) : (
                "Get Started"
              )}
            </button>
          </div>

          {/* Business Plan - 60% Features */}
          <div className={`${styles.card} ${styles.featured}`}>
            <div className={styles.badge}>Most Popular</div>

            <div className={styles.cardHeader}>
              <h3 className={styles.planName}>Business</h3>
              <p className={styles.planDescription}>
                For growing businesses with marketing and broadcast needs.
              </p>
            </div>

            <div className={styles.priceContainer}>
              <div className={styles.price}>
                <span className={styles.currency}>₹</span>
                <span className={styles.amount}>3,999</span>
                <span className={styles.period}>/mo</span>
              </div>
              <p className={styles.overageNote}>Best for 250-300 queries/day</p>
            </div>

            <ul className={styles.featureList}>
              <li className={styles.feature}>
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
                <span>8,000 AI Responses / month</span>
              </li>
              <li className={styles.feature}>
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
                <span>Up to 2 WhatsApp Numbers</span>
              </li>
              <li className={styles.feature}>
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
                <span>Up to 200 FAQs Training</span>
              </li>
              <li className={styles.feature}>
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
                <span>Broadcast Campaigns</span>
              </li>
              <li className={styles.feature}>
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
                <span>Template Message Builder</span>
              </li>
              <li className={styles.feature}>
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
                <span>Contact Management</span>
              </li>
              <li className={styles.feature}>
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
                <span>Basic Analytics Dashboard</span>
              </li>
              <li className={styles.feature}>
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
                <span>Chat Support</span>
              </li>
            </ul>

            <button
              className={`${styles.ctaButton} ${styles.ctaButtonFeatured}`}
              onClick={() => handleSubscribe("business")}
              disabled={isLoading !== null}
            >
              {isLoading === "business" ? (
                <span className={styles.loadingSpinner}>Processing...</span>
              ) : (
                "Get Started"
              )}
            </button>
          </div>

          {/* Pro Plan - All Features */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.planName}>Pro</h3>
              <p className={styles.planDescription}>
                For established businesses needing full automation power.
              </p>
            </div>

            <div className={styles.priceContainer}>
              <div className={styles.price}>
                <span className={styles.currency}>₹</span>
                <span className={styles.amount}>8,999</span>
                <span className={styles.period}>/mo</span>
              </div>
              <p className={styles.overageNote}>Best for 650+ queries/day</p>
            </div>

            <ul className={styles.featureList}>
              <li className={styles.feature}>
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
                <span>25,000 AI Responses / month</span>
              </li>
              <li className={styles.feature}>
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
                <span>Unlimited WhatsApp Numbers</span>
              </li>
              <li className={styles.feature}>
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
                <span>Unlimited FAQs Training</span>
              </li>
              <li className={styles.feature}>
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
                <span>Custom AI Personality Training</span>
              </li>
              <li className={styles.feature}>
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
                <span>Multi-Agent Team Inbox</span>
              </li>
              <li className={styles.feature}>
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
                <span>Advanced Workflow Automation</span>
              </li>
              <li className={styles.feature}>
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
                <span>API Access & Webhooks</span>
              </li>
              <li className={styles.feature}>
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
                <span>Advanced Analytics & Reports</span>
              </li>
              <li className={styles.feature}>
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
                <span>Priority Support + Onboarding</span>
              </li>
            </ul>

            <button
              className={`${styles.ctaButton} ${styles.ctaButtonFeatured}`}
              onClick={() => handleSubscribe("pro")}
              disabled={isLoading !== null}
            >
              {isLoading === "pro" ? (
                <span className={styles.loadingSpinner}>Processing...</span>
              ) : (
                "Get Started"
              )}
            </button>
          </div>
        </div>

        {/* Trust Section */}
        <div className={styles.trustSection}>
          <p className={styles.trustText}>
            🔒 Secure payments by Razorpay • No credit card required for trial •
            WhatsApp API costs included
          </p>
        </div>
      </div>
    </section>
  );
}
