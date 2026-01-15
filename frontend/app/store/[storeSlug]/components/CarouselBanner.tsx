"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import styles from "../store.module.css";

interface BannerSlide {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  buttonText?: string;
  buttonLink?: string;
  imageUrl: string;
  gradientFrom?: string;
  gradientTo?: string;
}

interface CarouselBannerProps {
  slides?: BannerSlide[];
  autoPlayInterval?: number;
}

const DEFAULT_SLIDES: BannerSlide[] = [
  {
    id: "1",
    title: "New Arrivals",
    subtitle: "Spring Collection 2025",
    description:
      "Discover the latest trends in ethnic fashion with our curated collection",
    buttonText: "Shop Now",
    buttonLink: "#",
    imageUrl:
      "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=1200",
    gradientFrom: "#22c15a",
    gradientTo: "#2dd4ff",
  },
  {
    id: "2",
    title: "Festive Sale",
    subtitle: "Up to 50% Off",
    description:
      "Celebrate in style with exclusive discounts on premium ethnic wear",
    buttonText: "Explore Deals",
    buttonLink: "#",
    imageUrl:
      "https://images.unsplash.com/photo-1583391733975-dae3a71ef3cc?w=1200",
    gradientFrom: "#f97316",
    gradientTo: "#facc15",
  },
  {
    id: "3",
    title: "Wedding Collection",
    subtitle: "Bridal Essentials",
    description:
      "Make your special day unforgettable with our exquisite wedding wear",
    buttonText: "View Collection",
    buttonLink: "#",
    imageUrl:
      "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=1200",
    gradientFrom: "#ec4899",
    gradientTo: "#8b5cf6",
  },
];

export default function CarouselBanner({
  slides = DEFAULT_SLIDES,
  autoPlayInterval = 5000,
}: CarouselBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const goToSlide = useCallback(
    (index: number) => {
      if (isAnimating) return;
      setIsAnimating(true);
      setCurrentIndex(index);
      setTimeout(() => setIsAnimating(false), 600);
    },
    [isAnimating]
  );

  const goToNext = useCallback(() => {
    const nextIndex = (currentIndex + 1) % slides.length;
    goToSlide(nextIndex);
  }, [currentIndex, slides.length, goToSlide]);

  const goToPrev = useCallback(() => {
    const prevIndex = (currentIndex - 1 + slides.length) % slides.length;
    goToSlide(prevIndex);
  }, [currentIndex, slides.length, goToSlide]);

  // Auto-play
  useEffect(() => {
    if (isPaused || slides.length <= 1) return;

    const interval = setInterval(goToNext, autoPlayInterval);
    return () => clearInterval(interval);
  }, [goToNext, autoPlayInterval, isPaused, slides.length]);

  // Touch handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const minSwipeDistance = 50;

    if (Math.abs(distance) < minSwipeDistance) return;

    if (distance > 0) {
      goToNext();
    } else {
      goToPrev();
    }

    setTouchStart(0);
    setTouchEnd(0);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goToPrev();
      if (e.key === "ArrowRight") goToNext();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToNext, goToPrev]);

  if (slides.length === 0) return null;

  const currentSlide = slides[currentIndex];

  return (
    <section
      ref={carouselRef}
      className={styles.carouselSection}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label="Featured promotions carousel"
    >
      <div className={styles.carouselContainer}>
        {/* Slides */}
        <div className={styles.carouselTrack}>
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className={`${styles.carouselSlide} ${
                index === currentIndex ? styles.carouselSlideActive : ""
              }`}
              style={
                {
                  "--gradient-from": slide.gradientFrom || "#22c15a",
                  "--gradient-to": slide.gradientTo || "#2dd4ff",
                } as React.CSSProperties
              }
            >
              {/* Background Image with Overlay */}
              <div className={styles.carouselImageWrapper}>
                <img
                  src={slide.imageUrl}
                  alt={slide.title}
                  className={styles.carouselImage}
                  loading={index === 0 ? "eager" : "lazy"}
                />
                <div className={styles.carouselImageOverlay} />
              </div>

              {/* Content */}
              <div className={styles.carouselContent}>
                {slide.subtitle && (
                  <span className={styles.carouselSubtitle}>
                    {slide.subtitle}
                  </span>
                )}
                <h2 className={styles.carouselTitle}>{slide.title}</h2>
                {slide.description && (
                  <p className={styles.carouselDescription}>
                    {slide.description}
                  </p>
                )}
                {slide.buttonText && (
                  <button className={styles.carouselButton}>
                    {slide.buttonText}
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Navigation Arrows */}
        {slides.length > 1 && (
          <>
            <button
              className={`${styles.carouselArrow} ${styles.carouselArrowPrev}`}
              onClick={goToPrev}
              disabled={isAnimating}
              aria-label="Previous slide"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <button
              className={`${styles.carouselArrow} ${styles.carouselArrowNext}`}
              onClick={goToNext}
              disabled={isAnimating}
              aria-label="Next slide"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </>
        )}

        {/* Dots Indicator */}
        {slides.length > 1 && (
          <div className={styles.carouselDots}>
            {slides.map((_, index) => (
              <button
                key={index}
                className={`${styles.carouselDot} ${
                  index === currentIndex ? styles.carouselDotActive : ""
                }`}
                onClick={() => goToSlide(index)}
                aria-label={`Go to slide ${index + 1}`}
                aria-current={index === currentIndex ? "true" : "false"}
              />
            ))}
          </div>
        )}

        {/* Progress Bar */}
        {slides.length > 1 && !isPaused && (
          <div className={styles.carouselProgress}>
            <div
              className={styles.carouselProgressBar}
              style={{
                animationDuration: `${autoPlayInterval}ms`,
              }}
              key={currentIndex}
            />
          </div>
        )}
      </div>
    </section>
  );
}
