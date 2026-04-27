"use client";

import Image from "next/image";
import styles from "./OnboardingPricingReplica.module.css";

type PlanId = "starter" | "business" | "pro";

export interface OnboardingPricingPlan {
  id: PlanId;
  name: string;
  priceDisplay: string;
  description: string;
  popular?: boolean;
  features: string[];
  tagline?: string;
}

function StarIcon({ filled = true }: { filled?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
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
  if (index <= 0) return "Everything you need to get started…";
  const previous = plans[index - 1];
  return `Everything in ${previous?.name ?? "previous plan"} plus…`;
}

export default function OnboardingPricingReplica(props: {
  plans: OnboardingPricingPlan[];
  paymentLoading: PlanId | null;
  paymentError: string | null;
  onDismissError: () => void;
  onSelectPlan: (planId: PlanId) => void;
}) {
  const { plans, paymentLoading, paymentError, onDismissError, onSelectPlan } =
    props;

  return (
    <section className={styles.wrap} aria-label="Pricing plans">
      <div className={styles.headerRow}>
        <h2 className={styles.title}>
          <span className={styles.titleSans}>We&apos;ve got a plan</span>
          <span className={styles.titleScript}>that&apos;s perfect for you</span>
        </h2>

        <div className={styles.socialProof} aria-label="Customer reviews">
          <div className={styles.avatars} aria-hidden="true">
            {[
              "30% 15%",
              "55% 10%",
              "70% 20%",
              "45% 35%",
            ].map((pos, i) => (
              <div key={i} className={styles.avatar}>
                <Image
                  src="/team.png"
                  alt=""
                  width={34}
                  height={34}
                  style={{ objectFit: "cover", objectPosition: pos }}
                />
              </div>
            ))}
          </div>

          <div className={styles.rating}>
            <div className={styles.ratingTop}>
              <div className={styles.stars} aria-hidden="true">
                <StarIcon />
                <StarIcon />
                <StarIcon />
                <StarIcon />
                <StarIcon />
              </div>
              <span className={styles.ratingValue}>5.0</span>
            </div>
            <div className={styles.ratingMeta}>from 4,000+ reviews</div>
          </div>
        </div>
      </div>

      {paymentError && (
        <div className={styles.errorBanner} role="alert" aria-live="polite">
          <p className={styles.errorText}>{paymentError}</p>
          <button
            type="button"
            className={styles.dismissBtn}
            onClick={onDismissError}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      <div className={styles.cardsGrid}>
        {plans.map((plan, index) => {
          const isBusy = paymentLoading !== null;
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
                  <div className={styles.period}>per month</div>
                </div>
                <p className={styles.description}>{plan.description}</p>
              </div>

              <button
                type="button"
                className={styles.cta}
                onClick={() => onSelectPlan(plan.id)}
                disabled={isBusy}
              >
                {isThisLoading ? "Processing..." : "Get started"}
              </button>

              {isStarter && (
                <p className={styles.trialNote}>
                  7-day free trial • no credit card required
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

