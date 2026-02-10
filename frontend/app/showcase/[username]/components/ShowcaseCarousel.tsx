"use client";

import React, { useState, useEffect, useCallback } from "react";
import styles from "../page.module.css";

interface ShowcaseCarouselProps {
  images?: string[];
  autoPlayInterval?: number;
}

const DEFAULT_IMAGES = [
  "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200",
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=1200",
  "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200",
];

export default function ShowcaseCarousel({
  images = DEFAULT_IMAGES,
  autoPlayInterval = 4000,
}: ShowcaseCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const goToSlide = useCallback(
    (index: number) => {
      if (isAnimating) return;
      setIsAnimating(true);
      setCurrentIndex(index);
      setTimeout(() => setIsAnimating(false), 600);
    },
    [isAnimating],
  );

  const goToNext = useCallback(() => {
    const nextIndex = (currentIndex + 1) % images.length;
    goToSlide(nextIndex);
  }, [currentIndex, images.length, goToSlide]);

  const goToPrev = useCallback(() => {
    const prevIndex = (currentIndex - 1 + images.length) % images.length;
    goToSlide(prevIndex);
  }, [currentIndex, images.length, goToSlide]);

  // Auto-play
  useEffect(() => {
    if (isPaused || images.length <= 1) return;

    const interval = setInterval(goToNext, autoPlayInterval);
    return () => clearInterval(interval);
  }, [goToNext, autoPlayInterval, isPaused, images.length]);

  if (images.length === 0) return null;

  return (
    <section
      className={styles.showcaseCarousel}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label="Showcase carousel"
    >
      <div className={styles.showcaseCarouselContainer}>
        {/* Slides */}
        <div className={styles.showcaseCarouselTrack}>
          {images.map((image, index) => (
            <div
              key={index}
              className={`${styles.showcaseCarouselSlide} ${
                index === currentIndex ? styles.showcaseCarouselSlideActive : ""
              }`}
            >
              <img
                src={image}
                alt={`Showcase ${index + 1}`}
                className={styles.showcaseCarouselImage}
                loading={index === 0 ? "eager" : "lazy"}
              />
              <div className={styles.showcaseCarouselOverlay} />
            </div>
          ))}
        </div>

        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <button
              className={`${styles.showcaseCarouselArrow} ${styles.showcaseCarouselArrowPrev}`}
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
              className={`${styles.showcaseCarouselArrow} ${styles.showcaseCarouselArrowNext}`}
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
        {images.length > 1 && (
          <div className={styles.showcaseCarouselDots}>
            {images.map((_, index) => (
              <button
                key={index}
                className={`${styles.showcaseCarouselDot} ${
                  index === currentIndex ? styles.showcaseCarouselDotActive : ""
                }`}
                onClick={() => goToSlide(index)}
                aria-label={`Go to slide ${index + 1}`}
                aria-current={index === currentIndex ? "true" : "false"}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
