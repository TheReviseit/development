"use client";

import { useState, useEffect } from "react";
import "./HowItWorks.css";

interface Step {
  id: number;
  title: string;
  description: string;
  icon: string;
  gradient: string;
  accentColor: string;
  details: string[];
}

const steps: Step[] = [
  {
    id: 1,
    title: "Connect WhatsApp",
    description:
      "Link your WhatsApp Business account seamlessly with our secure Cloud API integration.",
    icon: "whatsapp",
    gradient: "linear-gradient(135deg, #25D366 0%, #128C7E 100%)",
    accentColor: "#25D366",
    details: [
      "Instant QR code authentication",
      "Bank-level security encryption",
      "Official WhatsApp Cloud API",
      "60-second quick setup",
    ],
  },
  {
    id: 2,
    title: "AI-Powered Automation",
    description:
      "Design intelligent workflows with drag-and-drop simplicity and AI assistance.",
    icon: "automation",
    gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    accentColor: "#667eea",
    details: [
      "Visual workflow builder",
      "Smart AI suggestions",
      "Ready-to-use templates",
      "Custom trigger automation",
    ],
  },
  {
    id: 3,
    title: "Track & Optimize",
    description:
      "Monitor real-time analytics and scale your business with data-driven insights.",
    icon: "analytics",
    gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    accentColor: "#f093fb",
    details: [
      "Live performance dashboard",
      "Conversion tracking",
      "Customer behavior insights",
      "Automated reporting",
    ],
  },
];

export default function HowItWorks() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isFlipped, setIsFlipped] = useState<{ [key: number]: boolean }>({});

  const handleCardClick = (stepId: number) => {
    setActiveStep(stepId);
    setIsFlipped((prev) => ({ ...prev, [stepId]: !prev[stepId] }));
  };

  const renderIcon = (iconType: string) => {
    switch (iconType) {
      case "whatsapp":
        return (
          <svg fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
        );
      case "automation":
        return (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
            />
          </svg>
        );
      case "analytics":
        return (
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <section className="hiw-section">
      {/* Animated Background */}
      <div className="hiw-bg-wrapper">
        <div className="hiw-grid-lines"></div>
        <div className="hiw-floating-shapes">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="hiw-particle"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${10 + Math.random() * 10}s`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="hiw-container">
        {/* Header */}
        <div className="hiw-header">
          <div className="hiw-badge">
            <span className="hiw-badge-dot"></span>
            Simple Process
          </div>
          <h2 className="hiw-main-title">
            Transform Your Business in
            <span className="hiw-title-gradient"> Three Steps</span>
          </h2>
          <p className="hiw-main-subtitle">
            Experience the future of customer engagement with our revolutionary
            platform
          </p>
        </div>

        {/* 3D Cards Grid */}
        <div className="hiw-cards-wrapper">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`hiw-card-container ${
                activeStep === step.id ? "is-active" : ""
              }`}
              onClick={() => handleCardClick(step.id)}
              style={{ animationDelay: `${index * 0.15}s` }}
            >
              <div
                className={`hiw-card ${isFlipped[step.id] ? "is-flipped" : ""}`}
              >
                {/* Card Front */}
                <div className="hiw-card-face hiw-card-front">
                  {/* Glowing number badge */}
                  <div
                    className="hiw-glow-number"
                    style={{ background: step.gradient }}
                  >
                    <span>{step.id}</span>
                  </div>

                  {/* 3D Icon Container */}
                  <div
                    className="hiw-icon-3d"
                    style={{
                      background: step.gradient,
                      boxShadow: `0 20px 60px ${step.accentColor}40`,
                    }}
                  >
                    <div className="hiw-icon-inner">
                      {renderIcon(step.icon)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="hiw-card-content">
                    <h3 className="hiw-card-title">{step.title}</h3>
                    <p className="hiw-card-desc">{step.description}</p>
                  </div>

                  {/* Animated border */}
                  <div
                    className="hiw-card-border"
                    style={{ background: step.gradient }}
                  ></div>

                  {/* Click indicator */}
                  <div className="hiw-click-hint">
                    <span>Click to explore</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>

                {/* Card Back */}
                <div
                  className="hiw-card-face hiw-card-back"
                  style={{
                    background: `linear-gradient(135deg, ${step.accentColor}15 0%, ${step.accentColor}05 100%)`,
                  }}
                >
                  <div className="hiw-back-header">
                    <div
                      className="hiw-back-icon"
                      style={{ background: step.gradient }}
                    >
                      {renderIcon(step.icon)}
                    </div>
                    <h4>{step.title}</h4>
                  </div>

                  <ul className="hiw-features-list">
                    {step.details.map((detail, idx) => (
                      <li key={idx} style={{ animationDelay: `${idx * 0.1}s` }}>
                        <div
                          className="hiw-feature-check"
                          style={{ background: step.gradient }}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Click to return */}
                  <div className="hiw-flip-back">
                    <span>Click to return</span>
                  </div>
                </div>
              </div>

              {/* Connection Line */}
              {index < steps.length - 1 && (
                <div className="hiw-connector">
                  <div className="hiw-connector-line"></div>
                  <div className="hiw-connector-arrow">→</div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* CTA Section */}
        <div className="hiw-cta">
          <div className="hiw-cta-inner">
            <h3>Ready to revolutionize your workflow?</h3>
            <p>
              Join 10,000+ businesses already transforming their customer
              engagement
            </p>
            <div className="hiw-cta-actions">
              <a href="/signup" className="hiw-cta-primary">
                <span>Start Free Trial</span>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </a>
              <a href="#demo" className="hiw-cta-secondary">
                Watch Live Demo
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
