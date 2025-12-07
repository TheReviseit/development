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
          {/* Starter Plan */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.planName}>Starter</h3>
              <p className={styles.planDescription}>
                Perfect for solo entrepreneurs and small businesses starting
                with AI automation.
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
                <span>3,000 WhatsApp Messages</span>
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
                <span>Up to 75 FAQs Training</span>
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
                <span>Basic Chatbot Flows</span>
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
                <span>Lead Capture Forms</span>
              </li>
            </ul>

            <button className={styles.ctaButton}>Get Started</button>
          </div>

          {/* Business Plan - Featured */}
          <div className={`${styles.card} ${styles.featured}`}>
            <div className={styles.badge}>Most Popular</div>

            <div className={styles.cardHeader}>
              <h3 className={styles.planName}>Business</h3>
              <p className={styles.planDescription}>
                Perfect for SMBs with steady customer engagement and marketing
                needs.
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
                <span>15,000 WhatsApp Messages</span>
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
                <span>Up to 250 FAQs Training</span>
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
                <span>Advanced Workflows & Automation</span>
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
                <span>CRM Integration</span>
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
                <span>Analytics Dashboard</span>
              </li>
            </ul>

            <button
              className={`${styles.ctaButton} ${styles.ctaButtonFeatured}`}
            >
              Get Started
            </button>
          </div>

          {/* Pro Plan */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h3 className={styles.planName}>Pro</h3>
              <p className={styles.planDescription}>
                For established businesses with high-volume customer
                conversations.
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
                <span>20,000 AI Responses / month</span>
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
                <span>40,000 WhatsApp Messages</span>
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
                <span>Custom AI Training</span>
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
                <span>Multi-Agent Team Support</span>
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
                <span>Advanced Analytics & Reporting</span>
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
                <span>Priority Support</span>
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
