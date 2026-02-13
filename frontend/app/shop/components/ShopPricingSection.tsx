"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./ShopPricingSection.module.css";

const PLANS = [
  {
    name: "Basic plan",
    price: 1999,
    tagline: "Perfect for getting started with your online store.",
    featuresTitle: "Everything you need to launch...",
    features: [
      "Domain: Random domain Name  (e.g. store/abc1234)",
      "10 products (incl. variants)",
      "Standard invoice",
      "10 email invoices",
      "10 live order update via email",
      "Normal Dashboard",
      "Message inbox",
      "upto 10 days message history",
      "Email support",
    ],
    featured: false,
  },
  {
    name: "Business plan",
    price: 3999,
    tagline: "For growing businesses.",
    featuresTitle: "Everything in Basic plus...",
    features: [
      "Custom domain name (store/yourstorename)",
      "50 products (incl. variants)",
      "50 live order updates (Email & WhatsApp)",
      "Get order update in google sheets (upto 50 orders)",
      "Invoice customization",
      "Analytics dashboard",
      "Message inbox",
      "Up to 50 days message history",
      "Email and call support",
    ],
    featured: true,
    badge: "Popular",
  },
  {
    name: "Enterprise plan",
    price: 6999,
    tagline: "Advanced features + unlimited users.",
    featuresTitle: "Everything in Business plus...",
    features: [
      "Custom domain name (store/yourstorename)",
      "100 products",
      "100 live order updates (Email & WhatsApp)",
      "Get order update in google sheets",
      "Invoice customization",
      "Analytics dashboard",
      "Message inbox",
      "No limit message history",
      "Email and call support",
    ],
    featured: false,
  },
];

export default function ShopPricingSection() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">(
    "monthly",
  );

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
          {PLANS.map((plan, idx) => (
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
