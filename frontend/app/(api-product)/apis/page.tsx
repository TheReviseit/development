"use client";

import React, { useState } from "react";
import Link from "next/link";
import "./apis.css";

// Icons
const ShieldIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const ZapIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const LockIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0110 0v4" />
  </svg>
);

const WebhookIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <path d="M18 16.98h-5.99c-1.66 0-3.01-1.34-3.01-3s1.34-3 3.01-3" />
    <path d="M20 13.99V10c0-4.42-3.58-8-8-8s-8 3.58-8 8v4" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const CodeIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const GlobeIcon = () => (
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

const endpoints = [
  {
    method: "POST",
    path: "/v1/otp/send",
    title: "Send OTP",
    description:
      "Generate and send a secure OTP to any phone number via WhatsApp. Supports custom TTL, length, and metadata.",
    tags: ["Authentication", "WhatsApp"],
  },
  {
    method: "POST",
    path: "/v1/otp/verify",
    title: "Verify OTP",
    description:
      "Verify a user-submitted OTP code. Returns verification status with attempt tracking.",
    tags: ["Verification", "Security"],
  },
  {
    method: "POST",
    path: "/v1/otp/resend",
    title: "Resend OTP",
    description:
      "Resend an existing OTP with automatic channel escalation and rate limit protection.",
    tags: ["Retry", "Fallback"],
  },
  {
    method: "GET",
    path: "/v1/otp/status/{id}",
    title: "Check Status",
    description:
      "Get real-time status of an OTP request including delivery and verification status.",
    tags: ["Status", "Monitoring"],
  },
];

const features = [
  {
    icon: <ShieldIcon />,
    title: "Bank-Grade Security",
    description: "HMAC-SHA256 hashed OTPs. Never stored in plaintext.",
  },
  {
    icon: <ZapIcon />,
    title: "Lightning Fast",
    description: "Sub-200ms response times with async delivery.",
  },
  {
    icon: <LockIcon />,
    title: "Fraud Prevention",
    description: "Hybrid rate limits and auto-blacklist.",
  },
  {
    icon: <WebhookIcon />,
    title: "Webhooks",
    description: "Real-time delivery status via HMAC-signed callbacks.",
  },
  {
    icon: <CodeIcon />,
    title: "Developer First",
    description: "Idempotency, sandbox mode, and comprehensive errors.",
  },
  {
    icon: <GlobeIcon />,
    title: "Multi-Channel",
    description: "WhatsApp primary with SMS fallback.",
  },
];

const codeExamples = {
  curl: `curl -X POST https://api.flowauxi.com/v1/otp/send \\
  -H "Authorization: Bearer otp_live_xxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+919876543210",
    "purpose": "login",
    "channel": "whatsapp"
  }'`,
  javascript: `const response = await fetch('https://api.flowauxi.com/v1/otp/send', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer otp_live_xxxxxxxxxxxx',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to: '+919876543210',
    purpose: 'login',
    channel: 'whatsapp'
  })
});

const { request_id } = await response.json();`,
  python: `import requests

response = requests.post(
    'https://api.flowauxi.com/v1/otp/send',
    headers={'Authorization': 'Bearer otp_live_xxxxxxxxxxxx'},
    json={
        'to': '+919876543210',
        'purpose': 'login',
        'channel': 'whatsapp'
    }
)

request_id = response.json()['request_id']`,
};

export default function APIsPage() {
  const [activeTab, setActiveTab] = useState<"curl" | "javascript" | "python">(
    "curl",
  );

  return (
    <div className="api-docs-page">
      {/* Fixed Header at Top */}
      <header className="api-header">
        <div className="api-header-inner">
          <Link href="/apis" className="api-header-logo">
            <img src="/logo.png" alt="Flowauxi" className="api-logo-img" />
            <span>Flowauxi API</span>
          </Link>

          <nav className="api-header-nav">
            <a href="#endpoints" className="api-header-link">
              Endpoints
            </a>
            <a href="#quickstart" className="api-header-link">
              Quickstart
            </a>
            <a href="#features" className="api-header-link">
              Features
            </a>
            <Link href="/apis/pricing" className="api-header-link">
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

      {/* Hero */}
      <section className="api-hero">
        <div className="api-hero-content">
          <div className="api-hero-badge">
            <span>Now in Beta</span>
          </div>
          <h1 className="api-hero-title">OTP Verification API</h1>
          <p className="api-hero-subtitle">
            Production-grade OTP verification for WhatsApp. Secure, fast, and
            built for scale.
          </p>
          <div className="api-stats">
            <div className="api-stat">
              <div className="api-stat-value">&lt;200ms</div>
              <div className="api-stat-label">Response Time</div>
            </div>
            <div className="api-stat">
              <div className="api-stat-value">99.9%</div>
              <div className="api-stat-label">Uptime SLA</div>
            </div>
            <div className="api-stat">
              <div className="api-stat-value">10M+</div>
              <div className="api-stat-label">OTPs Delivered</div>
            </div>
          </div>
        </div>
      </section>

      {/* Endpoints */}
      <section id="endpoints" className="api-endpoints-section">
        <h2 className="api-section-title">API Endpoints</h2>
        <div className="api-endpoints-grid">
          {endpoints.map((endpoint, index) => (
            <div key={index} className="endpoint-card">
              <div className="endpoint-header">
                <span
                  className={`endpoint-method ${endpoint.method.toLowerCase()}`}
                >
                  {endpoint.method}
                </span>
                <code className="endpoint-path">{endpoint.path}</code>
              </div>
              <h3 className="endpoint-title">{endpoint.title}</h3>
              <p className="endpoint-description">{endpoint.description}</p>
              <div className="endpoint-tags">
                {endpoint.tags.map((tag, i) => (
                  <span key={i} className="endpoint-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Code Examples */}
      <section id="quickstart" className="api-code-section">
        <div className="api-code-container">
          <div className="api-code-header">
            <h2 className="api-code-title">Quick Start</h2>
            <p className="api-code-subtitle">
              Send your first OTP in under 5 minutes
            </p>
          </div>

          <div className="code-tabs">
            <button
              className={`code-tab ${activeTab === "curl" ? "active" : ""}`}
              onClick={() => setActiveTab("curl")}
            >
              cURL
            </button>
            <button
              className={`code-tab ${activeTab === "javascript" ? "active" : ""}`}
              onClick={() => setActiveTab("javascript")}
            >
              JavaScript
            </button>
            <button
              className={`code-tab ${activeTab === "python" ? "active" : ""}`}
              onClick={() => setActiveTab("python")}
            >
              Python
            </button>
          </div>

          <div className="code-block">
            <pre>{codeExamples[activeTab]}</pre>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="api-features">
        <h2 className="api-section-title">Features</h2>
        <div className="api-features-grid">
          {features.map((feature, index) => (
            <div key={index} className="api-feature-card">
              <div className="api-feature-icon">{feature.icon}</div>
              <h3 className="api-feature-title">{feature.title}</h3>
              <p className="api-feature-description">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="api-cta-section">
        <h2 className="api-cta-title">Ready to get started?</h2>
        <p className="api-cta-subtitle">
          Create your account and get an API key in seconds.
        </p>
        <Link href="/console/signup" className="api-cta-btn">
          Start Building <ArrowRightIcon />
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
