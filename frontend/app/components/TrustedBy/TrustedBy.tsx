import React from "react";
import "./TrustedBy.css";

const TrustedBy = () => {
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

  return (
    <section className="trusted-by-section">
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
