"use client";

import React, { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./TrustedBy.css";

// Register ScrollTrigger plugin
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const TrustedBy = () => {
  const sectionRef = useRef<HTMLElement>(null);

  // Professional company logos/names
  const companies = [
    "Carrd",
    "Hyperfury",
    "Plutio",
    "Solo",
    "AnyTrack",
    "SolidGigs",
    "Loomly",
    "Kapture CX",
    "WebEngage",
    "Powerup Money",
    "Biodesign Innovation Labs",
    "EmerTech Innovations",
  ];

  useEffect(() => {
    if (sectionRef.current) {
      gsap.fromTo(
        sectionRef.current,
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 80%",
            toggleActions: "play none none none",
          },
        }
      );
    }
  }, []);

  return (
    <section className="trusted-by-section" ref={sectionRef}>
      <div className="container">
        <p className="label text-center trusted-by-label">
          Trusted by businesses worldwide
        </p>

        {/* Scrolling container with gradient fade edges */}
        <div className="trusted-by-scroll-wrapper">
          <div className="trusted-by-scroll-container">
            {/* First set of logos */}
            <div className="trusted-by-scroll-track">
              {companies.map((company, index) => (
                <div key={`${company}-1-${index}`} className="trusted-by-item">
                  <div className="trusted-by-logo">
                    <span>{company}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Duplicate set for seamless loop */}
            <div className="trusted-by-scroll-track" aria-hidden="true">
              {companies.map((company, index) => (
                <div key={`${company}-2-${index}`} className="trusted-by-item">
                  <div className="trusted-by-logo">
                    <span>{company}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Gradient fade overlays */}
          <div className="trusted-by-fade trusted-by-fade-left"></div>
          <div className="trusted-by-fade trusted-by-fade-right"></div>
        </div>
      </div>
    </section>
  );
};

export default TrustedBy;
