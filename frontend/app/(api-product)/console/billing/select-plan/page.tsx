"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import "../console.css";
import "./billing.css";

interface Plan {
  id: string;
  name: string;
  amount: number;
  amount_display: string;
  currency: string;
  interval: string;
  features: string[];
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function SelectPlanPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPlans();
    fetchCurrentSubscription();
  }, []);

  const fetchPlans = async () => {
    try {
      const res = await fetch("/api/console/billing/plans");
      const data = await res.json();
      if (data.success) {
        // Filter out enterprise or allow it? Start with filtering out if no ID
        // The backend returns action='contact_sales' for enterprise, let's keep it simple for now and filter out non-purchasable
        const purchasablePlans = data.plans.filter(
          (p: any) => p.amount > 0 && p.id !== "enterprise",
        );
        setPlans(purchasablePlans);
      }
    } catch (err) {
      console.error("Failed to fetch plans:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentSubscription = async () => {
    try {
      const res = await fetch("/api/console/billing/current", {
        credentials: "include",
      });
      const data = await res.json();
      if (data.success && data.subscription) {
        setCurrentPlan(data.subscription.plan_name);
      }
    } catch (err) {
      console.error("Failed to fetch subscription:", err);
    }
  };

  const handleSelectPlan = async () => {
    if (!selectedPlan) return;

    setProcessing(true);
    setError(null);

    try {
      // Create order
      const res = await fetch("/api/console/billing/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan_name: selectedPlan }),
      });

      const data = await res.json();

      if (!data.success) {
        if (data.error === "ALREADY_SUBSCRIBED") {
          setError("You already have an active subscription.");
          return;
        }
        setError(data.message || "Failed to create order");
        return;
      }

      // Store order info for checkout page
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

      // Redirect to checkout
      router.push("/console/billing/checkout");
    } catch (err) {
      console.error("Order creation failed:", err);
      setError("Failed to process. Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="billing-page">
        <div className="billing-loading">Loading plans...</div>
      </div>
    );
  }

  return (
    <div className="billing-page">
      <div className="billing-header">
        <h1>Choose Your Plan</h1>
        <p>Select a plan to unlock live API access and start sending OTPs</p>
      </div>

      {error && (
        <div className="billing-error">
          <span>⚠️</span> {error}
        </div>
      )}

      <div className="plans-grid">
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const isCurrent = currentPlan === plan.id;

          return (
            <div
              key={plan.id}
              className={`plan-card ${isSelected ? "selected" : ""} ${
                isCurrent ? "current" : ""
              }`}
              onClick={() => !isCurrent && setSelectedPlan(plan.id)}
            >
              {isCurrent && <div className="plan-badge">Current Plan</div>}
              {plan.id === "growth" && !isCurrent && (
                <div className="plan-badge popular">Most Popular</div>
              )}

              <h3 className="plan-name">{plan.name}</h3>
              <div className="plan-price">
                <span className="amount">
                  ₹{(plan.amount / 100).toLocaleString()}
                </span>
                <span className="period">/month</span>
              </div>

              <ul className="plan-features">
                {plan.features.map((feature, i) => (
                  <li key={i}>
                    <CheckIcon />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                className={`plan-select-btn ${isSelected ? "selected" : ""} ${
                  isCurrent ? "current" : ""
                }`}
                disabled={isCurrent}
              >
                {isCurrent
                  ? "Current Plan"
                  : isSelected
                    ? "Selected"
                    : "Select Plan"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="billing-actions">
        <button
          className="billing-cta"
          disabled={!selectedPlan || processing}
          onClick={handleSelectPlan}
        >
          {processing ? "Processing..." : "Continue to Payment"}
        </button>

        <p className="billing-note">
          You can cancel or change your plan at any time.
        </p>
      </div>
    </div>
  );
}
