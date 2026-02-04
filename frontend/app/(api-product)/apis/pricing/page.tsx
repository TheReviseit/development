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
    price: "₹799",
    period: "/month",
    description: "Perfect for MVPs and early-stage startups",
    features: [
      "All prices exclusive of GST",
      "Live OTP API access",
      "WhatsApp OTPs at ₹0.75/OTP",
      "Standard API latency",
      "1 Webhook integration",
      "Basic usage analytics",
      "Email support",
      "Secure API keys & console access",
    ],
    limits: ["Soft usage cap: ~10,000 OTPs/month", "Rate limits enforced"],
    cta: "Get Started",
    ctaLink: "/console/signup",
    highlighted: false,
  },
  {
    name: "Growth",
    price: "₹1,999",
    period: "/month",
    description: "Built for growing products with higher OTP volume",
    features: [
      "All prices exclusive of GST",
      "WhatsApp OTPs at ₹0.60/OTP",
      "Priority API routing (lower latency)",
      "Unlimited webhooks",
      "Production-grade API keys",
      "Advanced analytics dashboard",
      "Priority chat support",
    ],
    limits: ["Higher rate limits", "Soft usage cap: ~50,000 OTPs/month"],
    cta: "Start Free Trial",
    ctaLink: "/console/signup",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For high-volume businesses and enterprises",
    features: [
      "All prices exclusive of GST",
      "Volume OTP pricing (₹0.50/OTP and below)",
      "Dedicated account manager",
      "Custom SLA (99.9%+ uptime)",
      "High throughput & custom rate limits",
      "White-label & IP-restricted APIs",
      "Custom integrations",
      "24/7 premium support",
    ],
    limits: [],
    cta: "Contact Sales",
    ctaLink: "mailto:sales@flowauxi.com",
    highlighted: false,
  },
];

const faqs = [
  {
    question: "Are there any free OTPs?",
    answer:
      "No. There are no free OTPs on any plan. Every OTP sent is billed. However, sandbox/testing mode is available for development without real OTP delivery.",
  },
  {
    question: "How does billing work?",
    answer:
      "Monthly plan fee + usage charges apply. OTP usage is billed per successful send. Unused OTP credits do not roll over.",
  },
  {
    question: "Can I switch plans anytime?",
    answer:
      "Yes! You can upgrade your plan at any time. Changes take effect immediately.",
  },
  {
    question: "What payment methods do you accept?",
    answer:
      "We accept all major credit cards, debit cards, UPI, and net banking through Razorpay. Enterprise customers can pay via invoice.",
  },
  {
    question: "Do you offer volume discounts?",
    answer:
      "Yes, enterprise plans include custom pricing based on volume. Contact our sales team at sales@flowauxi.com for a personalized quote.",
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
          No hidden fees. Pay monthly plan + per-OTP usage. Sandbox testing
          available.
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
            {plan.limits && plan.limits.length > 0 && (
              <div className="pricing-limits">
                <p className="pricing-limits-title">Limits & Notes</p>
                <ul className="pricing-limits-list">
                  {plan.limits.map((limit, i) => (
                    <li key={i} className="pricing-limits-item">
                      • {limit}
                    </li>
                  ))}
                </ul>
              </div>
            )}
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
          Create your account and get your API keys in seconds. Sandbox testing
          included.
        </p>
        <Link href="/console/signup" className="api-cta-btn">
          Get API Key
        </Link>
        <p className="pricing-sales-contact">
          <a href="mailto:sales@flowauxi.com" className="pricing-sales-link">
            Contact sales@flowauxi.com
          </a>
        </p>
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
