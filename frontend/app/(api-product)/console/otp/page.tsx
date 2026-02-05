"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Script from "next/script";
import "./otp.css";

// =============================================================================
// Icons (SVG)
// =============================================================================

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const EmailIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    width="22"
    height="22"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="M22 6L12 13 2 6" />
  </svg>
);

const CheckIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    width="16"
    height="16"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    width="18"
    height="18"
  >
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

const ShieldIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    width="20"
    height="20"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const ZapIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    width="20"
    height="20"
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const GlobeIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    width="20"
    height="20"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
  </svg>
);

const StarIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    width="20"
    height="20"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

// =============================================================================
// Types
// =============================================================================

interface Plan {
  id: string;
  name: string;
  amount: number;
  amount_display: string;
  currency: string;
  interval: string;
  features: string[];
}

interface Subscription {
  plan_name: string;
  billing_status: string;
  entitlement_level: string;
}

declare global {
  interface Window {
    Razorpay: any;
  }
}

// =============================================================================
// Upgrade Page Component
// =============================================================================

export default function UpgradePage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentSubscription, setCurrentSubscription] =
    useState<Subscription | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch plans
      const plansRes = await fetch("/api/console/billing/plans");
      const plansData = await plansRes.json();
      if (plansData.success) {
        setPlans(plansData.plans);
      }

      // Fetch current subscription
      const subRes = await fetch("/api/console/billing/current", {
        credentials: "include",
      });
      const subData = await subRes.json();
      if (subData.success && subData.subscription) {
        setCurrentSubscription(subData.subscription);
      }
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = async (planId: string) => {
    if (currentSubscription?.plan_name === planId) return;

    if (planId === "enterprise") {
      window.location.href = "mailto:sales@flowauxi.com";
      return;
    }

    setSelectedPlan(planId);
    setProcessing(true);
    setError(null);

    try {
      // Create order
      const res = await fetch("/api/console/billing/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan_name: planId }),
      });

      const data = await res.json();

      if (!data.success) {
        if (data.error === "ALREADY_SUBSCRIBED") {
          setError("You already have an active subscription.");
          setProcessing(false);
          return;
        }
        setError(data.message || "Failed to create order");
        setProcessing(false);
        return;
      }

      // Store order info and redirect to checkout
      sessionStorage.setItem(
        "billing_order",
        JSON.stringify({
          subscription_id: data.subscription_id,
          key_id: data.key_id,
          amount: data.amount,
          currency: data.currency,
          plan_name: data.plan_name,
        }),
      );

      router.push("/console/billing/checkout");
    } catch (err) {
      console.error("Order creation failed:", err);
      setError("Failed to process. Please try again.");
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <>
        <header className="console-header">
          <h1 className="console-header-title">Upgrade Plan</h1>
        </header>
        <div className="console-content">
          <div className="upgrade-loading">
            <div className="upgrade-loading-spinner" />
          </div>
        </div>
      </>
    );
  }

  const currentPlanName = currentSubscription?.plan_name || null;
  const entitlementLevel = currentSubscription?.entitlement_level || "sandbox";

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />

      <header className="console-header">
        <h1 className="console-header-title">Upgrade Plan</h1>
        <Link href="/docs" className="upgrade-docs-link">
          View API Docs
          <ArrowRightIcon />
        </Link>
      </header>

      <div className="console-content">
        {/* Current Status Banner */}
        <div className="upgrade-status-banner">
          <div className="upgrade-status-icon">
            {entitlementLevel === "sandbox" ? "🧪" : "🚀"}
          </div>
          <div className="upgrade-status-text">
            <h4>
              {entitlementLevel === "sandbox"
                ? "Sandbox Mode"
                : currentPlanName
                  ? `${currentPlanName.charAt(0).toUpperCase() + currentPlanName.slice(1)} Plan`
                  : "Active"}
            </h4>
            <p>
              {entitlementLevel === "sandbox"
                ? "Test keys only. Upgrade to create live API keys."
                : "You have full access to live APIs."}
            </p>
          </div>
        </div>

        {error && (
          <div className="upgrade-error">
            <span>⚠️</span> {error}
          </div>
        )}

        <p className="upgrade-subtitle">
          Choose a plan to unlock live API access and send real OTPs.
        </p>

        {/* Plans Grid */}
        <div className="upgrade-plans-grid">
          {plans.map((plan) => {
            const isCurrent = currentPlanName === plan.id;
            const isSelected = selectedPlan === plan.id;
            const isPopular = plan.id === "growth";
            const isEnterprise = plan.id === "enterprise";

            return (
              <div
                key={plan.id}
                className={`upgrade-plan-card ${isCurrent ? "current" : ""} ${isSelected ? "selected" : ""} ${isPopular ? "popular" : ""}`}
              >
                {isPopular && !isCurrent && (
                  <div className="upgrade-plan-badge">Most Popular</div>
                )}
                {isCurrent && (
                  <div className="upgrade-plan-badge current">Current Plan</div>
                )}

                <h3 className="upgrade-plan-name">{plan.name}</h3>

                <div className="upgrade-plan-price">
                  {isEnterprise ? (
                    <span className="amount">Custom</span>
                  ) : (
                    <>
                      <span className="amount">
                        ₹{(plan.amount / 100).toLocaleString()}
                      </span>
                      <span className="period">/month</span>
                    </>
                  )}
                </div>

                <ul className="upgrade-plan-features">
                  {plan.features.map((feature, i) => (
                    <li key={i}>
                      <CheckIcon />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  className={`upgrade-plan-btn ${isCurrent ? "current" : ""}`}
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={isCurrent || (processing && isSelected)}
                >
                  {isCurrent
                    ? "Current Plan"
                    : isEnterprise
                      ? "Contact Sales"
                      : processing && isSelected
                        ? "Processing..."
                        : "Select Plan"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Features Section */}
        <div className="upgrade-features-section">
          <h3>All Plans Include</h3>
          <div className="upgrade-features-grid">
            <div className="upgrade-feature-item">
              <WhatsAppIcon />
              <span>WhatsApp OTP</span>
            </div>
            <div className="upgrade-feature-item">
              <EmailIcon />
              <span>Email OTP</span>
            </div>
            <div className="upgrade-feature-item">
              <ShieldIcon />
              <span>Secure Hashing</span>
            </div>
            <div className="upgrade-feature-item">
              <ZapIcon />
              <span>Fast Delivery</span>
            </div>
            <div className="upgrade-feature-item">
              <GlobeIcon />
              <span>Global Reach</span>
            </div>
            <div className="upgrade-feature-item">
              <StarIcon />
              <span>99.9% Uptime</span>
            </div>
          </div>
        </div>

        <p className="upgrade-guarantee">Cancel anytime.</p>
      </div>
    </>
  );
}
