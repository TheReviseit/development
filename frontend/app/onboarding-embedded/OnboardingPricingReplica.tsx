"use client";

import type { KeyboardEvent } from "react";
import styles from "./OnboardingPricingReplica.module.css";
import type { OnboardingPricingMode } from "./pricing-decision";

type PlanId = "starter" | "business" | "pro";

export interface OnboardingPricingPlan {
  id: PlanId;
  name: string;
  priceDisplay: string;
  description: string;
  popular?: boolean;
  features: string[];
  tagline?: string;
  price: number;
  currency: string;
}

function CheckIcon() {
  return (
    <svg
      className={styles.checkIcon}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function getFeaturesIntro(
  plans: OnboardingPricingPlan[],
  index: number,
): string {
  const plan = plans[index];
  if (plan?.tagline) return plan.tagline;
  if (index <= 0) return "Everything you need to get started...";
  const previous = plans[index - 1];
  return `Everything in ${previous?.name ?? "previous plan"} plus...`;
}

export default function OnboardingPricingReplica(props: {
  plans: OnboardingPricingPlan[];
  pricingMode: OnboardingPricingMode;
  trialToggleEnabled: boolean;
  isBusy: boolean;
  isRedirecting: boolean;
  paymentLoading: PlanId | null;
  paymentError: string | null;
  onPricingModeChange: (mode: OnboardingPricingMode) => void;
  onDismissError: () => void;
  onSelectPlan: (planId: PlanId) => void;
}) {
  const {
    plans,
    pricingMode,
    trialToggleEnabled,
    isBusy,
    isRedirecting,
    paymentLoading,
    paymentError,
    onPricingModeChange,
    onDismissError,
    onSelectPlan,
  } = props;

  const isTrialMode = pricingMode === "trial";

  const handleToggle = () => {
    if (!trialToggleEnabled || isBusy) return;
    onPricingModeChange(isTrialMode ? "paid" : "trial");
  };

  const handleToggleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    handleToggle();
  };

  return (
    <section
      className={styles.wrap}
      aria-label="Pricing plans"
      aria-busy={isBusy}
    >
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.title}>Choose your launch plan</h2>
          <p className={styles.subtitle}>
            Start with the plan that fits today. You can adjust it from your
            dashboard as your usage grows.
          </p>
        </div>

        {trialToggleEnabled && (
          <div className={styles.headerControls}>
            <button
              type="button"
              className={`${styles.trialSwitch} ${
                isTrialMode ? styles.trialSwitchOn : ""
              }`}
              role="switch"
              aria-label="Free trial pricing mode"
              aria-checked={isTrialMode}
              aria-disabled={isBusy}
              disabled={isBusy}
              onClick={handleToggle}
              onKeyDown={handleToggleKeyDown}
            >
              <span className={styles.trialSwitchLabel}>
                <span className={styles.controlLabelFull}>Free trial</span>
                <span className={styles.controlLabelCompact}>Trial</span>
              </span>
              <span className={styles.trialSwitchTrack} aria-hidden="true">
                <span className={styles.trialSwitchThumb} />
              </span>
            </button>
          </div>
        )}
      </div>

      {paymentError && (
        <div className={styles.errorBanner} role="alert" aria-live="polite">
          <p className={styles.errorText}>{paymentError}</p>
          <button
            type="button"
            className={styles.dismissBtn}
            onClick={onDismissError}
            disabled={isBusy}
            aria-label="Dismiss error"
          >
            x
          </button>
        </div>
      )}

      <div
        className={`${styles.cardsGrid} ${
          isTrialMode ? styles.cardsGridTrial : ""
        }`}
      >
        {plans.map((plan, index) => {
          const isPlanActionBusy = isBusy || paymentLoading !== null;
          const isThisLoading = paymentLoading === plan.id;
          const isStarter = plan.id === "starter";

          return (
            <div key={plan.id} className={styles.card}>
              {plan.popular && (
                <div className={styles.popularPill} aria-label="Popular plan">
                  Popular
                </div>
              )}

              <div>
                <div className={styles.planName}>{plan.name} plan</div>
                <div className={styles.priceRow}>
                  <div className={styles.price}>{plan.priceDisplay}</div>
                  <div className={styles.period}>/ month</div>
                </div>
                <p className={styles.description}>{plan.description}</p>
              </div>

              <button
                type="button"
                className={styles.cta}
                onClick={() => onSelectPlan(plan.id)}
                disabled={isPlanActionBusy}
              >
                {isThisLoading
                  ? isRedirecting
                    ? "Redirecting..."
                    : "Processing..."
                  : isTrialMode && isStarter
                    ? "Start free trial"
                    : "Get started"}
              </button>

              {isTrialMode && isStarter && (
                <p className={styles.trialNote}>
                  7-day free trial - no credit card required
                </p>
              )}

              <hr className={styles.divider} />

              <div className={styles.featuresLabel}>FEATURES</div>
              <p className={styles.featuresIntro}>
                {getFeaturesIntro(plans, index)}
              </p>

              <ul className={styles.features}>
                {plan.features.map((feature, idx) => (
                  <li key={idx} className={styles.featureItem}>
                    <CheckIcon />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
