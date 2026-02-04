"use client";

import Link from "next/link";
import "../apis.css";

const CheckIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const plans = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Perfect for testing and small projects",
    features: [
      "100 OTPs per month",
      "WhatsApp channel only",
      "Sandbox mode",
      "Community support",
      "Basic analytics",
    ],
    cta: "Get Started",
    ctaLink: "/console/signup",
    highlighted: false,
  },
  {
    name: "Growth",
    price: "₹2,999",
    period: "/month",
    description: "For growing businesses and apps",
    features: [
      "10,000 OTPs per month",
      "WhatsApp + SMS channels",
      "Production API keys",
      "Webhooks",
      "Priority support",
      "Advanced analytics",
      "Custom TTL & length",
    ],
    cta: "Start Free Trial",
    ctaLink: "/console/signup",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For high-volume and custom needs",
    features: [
      "Unlimited OTPs",
      "All channels",
      "Dedicated support",
      "Custom SLA",
      "White-label options",
      "On-premise deployment",
      "Custom integrations",
      "Compliance certifications",
    ],
    cta: "Contact Sales",
    ctaLink: "mailto:sales@flowauxi.com",
    highlighted: false,
  },
];

const faqs = [
  {
    question: "How does the free tier work?",
    answer:
      "The Starter plan gives you 100 free OTPs per month in sandbox mode. Perfect for development and testing. No credit card required.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards, debit cards, UPI, and net banking through Razorpay. Enterprise customers can pay via invoice.",
  },
  {
    question: "Can I switch plans anytime?",
    answer:
      "Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately, and we'll prorate your billing.",
  },
  {
    question: "What's included in priority support?",
    answer:
      "Priority support includes email response within 4 hours, dedicated Slack channel, and access to our engineering team for integration help.",
  },
  {
    question: "Do you offer volume discounts?",
    answer:
      "Yes, enterprise plans include custom pricing based on volume. Contact our sales team for a personalized quote.",
  },
];

export default function PricingPage() {
  return (
    <div className="api-docs-page">
      {/* Header */}
      <header className="api-header">
        <div className="api-header-inner">
          <Link href="/apis" className="api-header-logo">
            <img src="/logo.png" alt="Flowauxi" className="api-logo-img" />
            <span>Flowauxi API</span>
          </Link>

          <nav className="api-header-nav">
            <Link href="/apis#endpoints" className="api-header-link">
              Endpoints
            </Link>
            <Link href="/apis#quickstart" className="api-header-link">
              Quickstart
            </Link>
            <Link href="/apis/pricing" className="api-header-link active">
              Pricing
            </Link>
            <Link href="/docs" className="api-header-link">
              Docs
            </Link>
            <Link href="/console/login" className="api-header-cta">
              Get API Key
            </Link>
          </nav>
        </div>
      </header>

      {/* Pricing Hero */}
      <section className="pricing-hero">
        <h1 className="pricing-hero-title">Simple, Transparent Pricing</h1>
        <p className="pricing-hero-subtitle">
          Start free, scale as you grow. No hidden fees, no surprises.
        </p>
      </section>

      {/* Pricing Cards */}
      <section className="pricing-cards">
        {plans.map((plan, index) => (
          <div
            key={index}
            className={`pricing-card ${plan.highlighted ? "pricing-card-highlighted" : ""}`}
          >
            {plan.highlighted && (
              <div className="pricing-badge">Most Popular</div>
            )}
            <div className="pricing-card-header">
              <h3 className="pricing-plan-name">{plan.name}</h3>
              <div className="pricing-price">
                <span className="pricing-amount">{plan.price}</span>
                <span className="pricing-period">{plan.period}</span>
              </div>
              <p className="pricing-description">{plan.description}</p>
            </div>
            <ul className="pricing-features">
              {plan.features.map((feature, i) => (
                <li key={i} className="pricing-feature">
                  <CheckIcon />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Link
              href={plan.ctaLink}
              className={`pricing-cta ${plan.highlighted ? "pricing-cta-primary" : "pricing-cta-secondary"}`}
            >
              {plan.cta}
            </Link>
          </div>
        ))}
      </section>

      {/* FAQs */}
      <section className="pricing-faqs">
        <h2 className="pricing-faqs-title">Frequently Asked Questions</h2>
        <div className="pricing-faqs-grid">
          {faqs.map((faq, index) => (
            <div key={index} className="pricing-faq">
              <h3 className="pricing-faq-question">{faq.question}</h3>
              <p className="pricing-faq-answer">{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="api-cta-section">
        <h2 className="api-cta-title">Ready to get started?</h2>
        <p className="api-cta-subtitle">
          Start with 100 free OTPs. No credit card required.
        </p>
        <Link href="/console/signup" className="api-cta-btn">
          Create Free Account
        </Link>
      </section>

      {/* Footer */}
      <footer className="api-footer">
        <p className="api-footer-text">
          © {new Date().getFullYear()} Flowauxi. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
