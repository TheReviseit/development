"use client";

import { useState } from "react";
import "./HowItWorks.css";

interface Step {
  id: number;
  title: string;
  description: string;
  icon: string;
  color: string;
  details: string[];
  image?: string;
}

const steps: Step[] = [
  {
    id: 1,
    title: "Connect WhatsApp",
    description:
      "Link your WhatsApp Business account using the official Cloud API in minutes.",
    icon: "whatsapp",
    color: "from-[#25D366] to-[#128C7E]",
    details: [
      "Scan QR code or enter credentials",
      "Official WhatsApp Cloud API integration",
      "Secure authentication process",
      "Quick 2-minute setup",
    ],
  },
  {
    id: 2,
    title: "Set Smart Automations",
    description:
      "Create AI-powered workflows with our intuitive drag-and-drop builder.",
    icon: "automation",
    color: "from-[#2DD4FF] to-[#1E90FF]",
    details: [
      "Visual drag-and-drop workflow builder",
      "Pre-built templates for common scenarios",
      "AI-powered response suggestions",
      "Custom triggers and actions",
    ],
  },
  {
    id: 3,
    title: "Launch & Track Results",
    description:
      "Monitor performance with real-time analytics and optimize your campaigns.",
    icon: "analytics",
    color: "from-[#22C15A] to-[#15803D]",
    details: [
      "Real-time conversation analytics",
      "Response time tracking",
      "Conversion rate monitoring",
      "Detailed performance reports",
    ],
  },
];

export default function HowItWorks() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  const renderIcon = (iconType: string, className: string) => {
    switch (iconType) {
      case "whatsapp":
        return (
          <svg className={className} fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
          </svg>
        );
      case "automation":
        return (
          <svg
            className={className}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        );
      case "analytics":
        return (
          <svg
            className={className}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0-6V5a2 2 0 012-2h2a2 2 0 012 2v6a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <section className="how-it-works-section">
      {/* Background Elements */}
      <div className="hiw-background">
        <div className="hiw-gradient-orb hiw-orb-1"></div>
        <div className="hiw-gradient-orb hiw-orb-2"></div>
      </div>

      <div className="hiw-container">
        {/* Section Header */}
        <div className="hiw-header">
          <h2 className="hiw-title">How ReviseIt works</h2>
          <p className="hiw-subtitle">
            Get started in three simple steps and transform your customer
            engagement
          </p>
        </div>

        {/* Steps Timeline */}
        <div className="hiw-timeline-wrapper">
          {/* Progress Line */}
          <div className="hiw-progress-line">
            <div
              className="hiw-progress-fill"
              style={{
                ["--progress" as any]: `${
                  ((activeStep - 1) / (steps.length - 1)) * 100
                }%`,
              }}
            ></div>
          </div>

          {/* Steps */}
          <div className="hiw-steps-grid">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`hiw-step ${
                  activeStep === step.id ? "step-active" : ""
                } ${hoveredStep === step.id ? "step-hovered" : ""}`}
                onMouseEnter={() => setHoveredStep(step.id)}
                onMouseLeave={() => setHoveredStep(null)}
                onClick={() => setActiveStep(step.id)}
              >
                {/* Step Number Badge */}
                <div
                  className={`hiw-step-badge bg-gradient-to-br ${step.color}`}
                >
                  <span className="hiw-step-number">{step.id}</span>
                  <div className="hiw-badge-pulse"></div>
                </div>

                {/* Step Content Card */}
                <div className="hiw-step-card">
                  {/* Icon */}
                  <div
                    className={`hiw-step-icon-wrapper bg-gradient-to-br ${step.color}`}
                  >
                    {renderIcon(step.icon, "hiw-step-icon")}
                  </div>

                  {/* Title */}
                  <h3 className="hiw-step-title">{step.title}</h3>

                  {/* Description */}
                  <p className="hiw-step-description">{step.description}</p>

                  {/* Details List (Expanded on Active) */}
                  <div
                    className={`hiw-step-details ${
                      activeStep === step.id ? "details-visible" : ""
                    }`}
                  >
                    <div className="hiw-details-header">Key Features:</div>
                    <ul className="hiw-details-list">
                      {step.details.map((detail, idx) => (
                        <li key={idx} className="hiw-detail-item">
                          <svg
                            className="hiw-check-icon"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Arrow Connector */}
                  {index < steps.length - 1 && (
                    <div className="hiw-arrow-connector">
                      <svg
                        className="hiw-arrow"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 7l5 5m0 0l-5 5m5-5H6"
                        />
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Call to Action */}
        <div className="hiw-cta-section">
          <div className="hiw-cta-card">
            <div className="hiw-cta-content">
              <h3 className="hiw-cta-title">Ready to get started?</h3>
              <p className="hiw-cta-text">
                Join thousands of businesses automating their WhatsApp
                communication
              </p>
            </div>
            <div className="hiw-cta-buttons">
              <a href="/signup" className="btn btn-primary hiw-cta-btn">
                Start Free Trial
                <svg
                  className="hiw-btn-icon"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </a>
              <a href="#demo" className="btn btn-secondary hiw-cta-btn">
                Watch Demo
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
