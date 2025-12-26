import React from "react";
import styles from "./PricingCards.module.css";

export default function PricingCards() {
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

            <button className={styles.ctaButton}>Get Started</button>
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
            >
              Get Started
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
            >
              Get Started
            </button>
          </div>
        </div>

        {/* Trust Section */}
        <div className={styles.trustSection}>
          <p className={styles.trustText}>
            Trusted by Indian businesses • No credit card required • WhatsApp
            API costs included
          </p>
        </div>
      </div>
    </section>
  );
}
