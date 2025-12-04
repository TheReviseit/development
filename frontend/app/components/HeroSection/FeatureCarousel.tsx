"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import "./FeatureCarousel.css";

type Feature = {
  id: number;
  title: string;
  description: string;
  imagePath: string;
};

const features: Feature[] = [
  {
    id: 1,
    title: "Never Miss a Lead",
    description:
      "Reply to every WhatsApp message instantly with 24/7 AI agents that turn conversations into customers.",
    imagePath: "/hero_carousel/1st.jpg",
  },
  {
    id: 2,
    title: "See What Drives Revenue",
    description:
      "Track every chat, campaign, and funnel step with real-time analytics built for growth-focused teams.",
    imagePath: "/hero_carousel/2nd.jpg",
  },
  {
    id: 3,
    title: "One Inbox. Every Channel.",
    description:
      "Manage WhatsApp, Instagram, and Facebook messages from a single powerful dashboard.",
    imagePath: "/hero_carousel/3rd.jpg",
  },
  {
    id: 4,
    title: "Workflows That Work for You",
    description:
      "Drag-and-drop automation flows that match your business, not the other way around.",
    imagePath: "/hero_carousel/4th.jpg",
  },
  {
    id: 5,
    title: "Security You Can Sell On",
    description:
      "Enterprise-grade security with encryption and compliance you can confidently promise to your customers.",
    imagePath: "/hero_carousel/5th.jpg",
  },
];

export default function FeatureCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % features.length);
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const nextSlide = () => {
    setCurrentIndex((prev) => (prev + 1) % features.length);
  };

  const prevSlide = () => {
    setCurrentIndex((prev) => (prev - 1 + features.length) % features.length);
  };

  return (
    <div className="carousel-outer">
      <div className="carousel-container">
        <div className="carousel-wrapper">
          {features.map((feature, index) => (
            <div
              key={feature.id}
              className={`carousel-slide ${
                index === currentIndex ? "active" : ""
              }`}
            >
              <div className="carousel-image-wrapper">
                <Image
                  src={feature.imagePath}
                  alt={feature.title}
                  fill
                  className="carousel-image"
                  priority={index === 0}
                />
              </div>
              <div className="carousel-text-overlay">
                <h2 className="carousel-feature-title">{feature.title}</h2>
                <p className="carousel-feature-description">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Navigation Arrows */}
        <button
          className="carousel-arrow carousel-arrow-left"
          onClick={prevSlide}
          aria-label="Previous slide"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <button
          className="carousel-arrow carousel-arrow-right"
          onClick={nextSlide}
          aria-label="Next slide"
        >
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Dots BELOW the carousel */}
      <div className="carousel-dots-wrapper">
        <div className="carousel-dots">
          {features.map((_, index) => (
            <button
              key={index}
              className={`carousel-dot ${
                index === currentIndex ? "active" : ""
              }`}
              onClick={() => goToSlide(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
