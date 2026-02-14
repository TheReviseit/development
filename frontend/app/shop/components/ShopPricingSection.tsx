"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./ShopPricingSection.module.css";
import {
  fetchPricingPlans,
  formatPrice,
  type PricingPlan,
} from "@/lib/pricing/pricing.service";

// Map API plan data to display format
interface DisplayPlan {
  name: string;
  price: number;
  tagline: string;
  featuresTitle: string;
  features: string[];
  featured: boolean;
  badge?: string;
}

function mapToDisplayPlans(plans: PricingPlan[]): DisplayPlan[] {
  return plans.map((plan, index) => ({
    name: plan.display_name + " plan",
    price: plan.amount_paise / 100,
    tagline: plan.description || "",
    featuresTitle:
      index === 0
        ? "Everything you need to launch..."
        : `Everything in ${plans[index - 1]?.display_name || "Basic"} plus...`,
    features: plan.features || [],
    featured: index === 1, // Middle plan is featured
    badge: index === 1 ? "Popular" : undefined,
  }));
}

// Fallback plans (only shown if API fails to load)
const FALLBACK_PLANS: DisplayPlan[] = [
  {
    name: "Basic plan",
    price: 1999,
    tagline: "Perfect for getting started with your online store.",
    featuresTitle: "Everything you need to launch...",
    features: ["Loading pricing..."],
    featured: false,
  },
];

export default function ShopPricingSection() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">(
    "monthly",
  );
  const [plans, setPlans] = useState<DisplayPlan[]>(FALLBACK_PLANS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPricingPlans()
      .then((apiPlans) => {
        if (apiPlans.length > 0) {
          setPlans(mapToDisplayPlans(apiPlans));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className={styles.pricing}>
      <div className={styles.pricingInner}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            We've got a plan that's perfect for you
          </h1>

          <div className={styles.toggleContainer}>
            <button
              className={`${styles.toggleBtn} ${billingCycle === "monthly" ? styles.active : ""}`}
              onClick={() => setBillingCycle("monthly")}
            >
              Monthly billing
            </button>
            <button
              className={`${styles.toggleBtn} ${billingCycle === "annual" ? styles.active : ""}`}
              onClick={() => setBillingCycle("annual")}
            >
              Annual billing
            </button>
          </div>
        </div>

        <div className={styles.grid}>
          {plans.map((plan, idx) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className={`${styles.card} ${plan.featured ? styles.featured : ""}`}
            >
              {plan.badge && (
                <span className={styles.popularBadge}>{plan.badge}</span>
              )}

              <h3 className={styles.planName}>{plan.name}</h3>

              <div className={styles.priceWrapper}>
                <span className={styles.currency}>₹</span>
                <span className={styles.price}>
                  {billingCycle === "annual"
                    ? Math.floor(plan.price * 0.8)
                    : plan.price}
                </span>
                <div className={styles.period}>
                  per user
                  <br />
                  per month
                </div>
              </div>

              <p className={styles.tagline}>{plan.tagline}</p>

              <button className={`${styles.btn} ${styles.btnPrimary}`}>
                Get started
              </button>
              <button className={`${styles.btn} ${styles.btnSecondary}`}>
                Chat to sales
              </button>

              <div className={styles.featuresContainer}>
                <span className={styles.featuresTitle}>FEATURES</span>
                <span className={styles.featuresTagline}>
                  {plan.featuresTitle}
                </span>
                <ul className={styles.featuresList}>
                  {plan.features.map((feature) => (
                    <li key={feature} className={styles.featureItem}>
                      <Check
                        size={18}
                        className={styles.checkIcon}
                        strokeWidth={3}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
