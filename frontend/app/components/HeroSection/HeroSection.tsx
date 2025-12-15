"use client";

import { useState, useEffect, useRef } from "react";
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
  const heroLeftRef = useRef<HTMLDivElement>(null);
  const heroRightRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);
  const dynamicTextRef = useRef<HTMLSpanElement>(null);
  const gsapRef = useRef<typeof import("gsap").gsap | null>(null);

  // Initial entrance animations with dynamic GSAP import - deferred until idle
  useEffect(() => {
    let ctx: ReturnType<typeof import("gsap").gsap.context> | null = null;

    const loadGsap = () => {
      import("gsap").then(({ gsap }) => {
        gsapRef.current = gsap;
        ctx = gsap.context(() => {
          // Animate text from left
          gsap.fromTo(
            heroLeftRef.current?.querySelectorAll(
              ".hero-title > span, .hero-description"
            ) || [],
            { opacity: 0, x: -60 },
            {
              opacity: 1,
              x: 0,
              duration: 0.8,
              stagger: 0.15,
              ease: "power3.out",
            }
          );

          // Animate buttons from bottom
          gsap.fromTo(
            ctaRef.current?.querySelectorAll(".hero-cta-button") || [],
            { opacity: 0, y: 40 },
            {
              opacity: 1,
              y: 0,
              duration: 0.8,
              delay: 0.6,
              stagger: 0.15,
              ease: "power3.out",
            }
          );

          // Animate carousel from right
          gsap.fromTo(
            heroRightRef.current,
            { opacity: 0, x: 60 },
            {
              opacity: 1,
              x: 0,
              duration: 0.8,
              delay: 0.3,
              ease: "power3.out",
            }
          );
        });
      });
    };

    // Defer GSAP loading until browser is idle to reduce TBT
    if ("requestIdleCallback" in window) {
      (window as Window).requestIdleCallback(loadGsap, { timeout: 1000 });
    } else {
      setTimeout(loadGsap, 200);
    }

    return () => ctx?.revert();
  }, []);

  // Smooth dynamic text rotation with GSAP
  useEffect(() => {
    const interval = setInterval(() => {
      if (dynamicTextRef.current && gsapRef.current) {
        const gsap = gsapRef.current;
        // Fade out
        gsap.to(dynamicTextRef.current, {
          opacity: 0,
          y: -10,
          duration: 0.3,
          ease: "power2.in",
          onComplete: () => {
            // Change text
            setCurrentTextIndex((prev) => (prev + 1) % dynamicTexts.length);

            // Fade in
            gsap.fromTo(
              dynamicTextRef.current,
              { opacity: 0, y: 10 },
              {
                opacity: 1,
                y: 0,
                duration: 0.3,
                ease: "power2.out",
              }
            );
          },
        });
      }
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
          <div className="hero-left-content" ref={heroLeftRef}>
            <h1 className="hero-title">
              <span className="hero-title-regular">Let's</span>
              <span className="hero-title-bold hero-title-mobile">
                Automate WhatsApp and
              </span>
              <span className="hero-title-bold hero-title-desktop">
                Automate WhatsApp
              </span>
              <span
                ref={dynamicTextRef}
                className="hero-title-dynamic dynamic-text"
              >
                &#10075;{dynamicTexts[currentTextIndex]}&#10076;
              </span>
            </h1>

            <p className="hero-description">
              AI-powered messaging, automated workflows, and smart broadcasts to
              scale your customer conversations.
            </p>

            <div className="hero-cta-container" ref={ctaRef}>
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
          <div className="hero-right-content" ref={heroRightRef}>
            <FeatureCarousel />
          </div>
        </div>
      </div>
    </section>
  );
}
