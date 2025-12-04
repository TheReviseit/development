"use client";

import { useState, useEffect } from "react";
import FeatureCarousel from "./FeatureCarousel";
import "./HeroSection.css";

const dynamicTexts = [
  "Grow Your Business Faster",
  "Automation Without Effort",
  "Convert Leads Into Customers",
  "Sell Even While You Sleep",
  "Scale Without Limits",
];

export default function HeroSection() {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentTextIndex((prev) => (prev + 1) % dynamicTexts.length);
        setIsAnimating(false);
      }, 300);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="hero-section">
      {/* Background Gradient */}
      <div className="hero-background-gradient gradient-radial"></div>

      <div className="hero-container">
        <div className="hero-content-wrapper">
          {/* Left Content */}
          <div className="hero-left-content">
            <h1 className="hero-title">
              <span className="hero-title-regular">Let's</span>
              <span className="hero-title-bold hero-title-mobile">
                Automate WhatsApp and
              </span>
              <span className="hero-title-bold hero-title-desktop">
                Automate WhatsApp
              </span>
              <span
                className={`hero-title-dynamic dynamic-text ${
                  isAnimating ? "animating" : ""
                }`}
              >
                &#10075;{dynamicTexts[currentTextIndex]}&#10076;
              </span>
            </h1>

            <p className="hero-description">
              AI-powered messaging, automated workflows, and smart broadcasts to
              scale your customer conversations.
            </p>

            <div className="hero-cta-container">
              <a href="/signup" className="btn-header-primary hero-cta-button">
                Start Free Trial
                <svg
                  className="hero-cta-icon"
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
              <a href="#demo" className="btn-header-ghost hero-cta-button">
                Watch Demo
                <svg
                  className="hero-cta-icon"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </a>
            </div>
          </div>

          {/* Right Content - Feature Carousel */}
          <div className="hero-right-content">
            <FeatureCarousel />
          </div>
        </div>
      </div>
    </section>
  );
}
