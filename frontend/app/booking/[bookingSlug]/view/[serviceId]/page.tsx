"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter, useParams, notFound } from "next/navigation";
import styles from "./view.module.css";
import "../../booking.module.css"; // Import CSS variables

// ============================================================
// Types
// ============================================================
interface Service {
  id: string;
  name: string;
  description?: string;
  category?: string;
  price: number;
  duration: number;
  imageUrl?: string;
  tags?: string[];
}

interface BookingData {
  id: string;
  businessName: string;
  logoUrl?: string;
  services: Service[];
}

// ============================================================
// Helper Functions
// ============================================================
function formatPrice(price: number, currency: string = "INR"): string {
  if (price === 0) return "FREE";
  if (currency === "INR") return `₹${price.toLocaleString()}`;
  return `$${price.toLocaleString()}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

// ============================================================
// Main Component
// ============================================================
export default function ServiceViewPage() {
  const router = useRouter();
  const params = useParams();
  const bookingSlug = params.bookingSlug as string;
  const serviceId = params.serviceId as string;

  const [service, setService] = useState<Service | null>(null);
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0); // Carousel state

  // Fetch service data
  const fetchData = useCallback(async () => {
    if (!bookingSlug || !serviceId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/booking/${bookingSlug}`, {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok) {
        if (response.status === 404) {
          setError("not_found");
        } else {
          setError(result.error || "Failed to load service");
        }
        return;
      }

      if (result.success) {
        setBookingData(result.data);
        const foundService = result.data.services.find(
          (s: Service) => s.id === serviceId,
        );
        if (foundService) {
          setService(foundService);
        } else {
          setError("service_not_found");
        }
      }
    } catch (err) {
      console.error("[ServiceViewPage] Fetch error:", err);
      setError("Failed to load service");
    } finally {
      setLoading(false);
    }
  }, [bookingSlug, serviceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle 404
  if (error === "not_found" || error === "service_not_found") {
    notFound();
  }

  // Handle Book Now
  const handleBookNow = () => {
    if (!service) return;

    // Store selection in localStorage for the booking flow
    const selection = {
      serviceId: service.id,
      serviceName: service.name,
      price: service.price,
      duration: service.duration,
      imageUrl: service.imageUrl,
      fromViewPage: true,
      autoSelect: true, // Flag to auto-select this service on booking page
      createdAt: Date.now(),
    };
    localStorage.setItem(`booking_${bookingSlug}`, JSON.stringify(selection));

    // Navigate back to booking page - it will auto-select the service and show datetime picker
    router.push(`/booking/${bookingSlug}?selectService=${service.id}`);
  };

  // Handle back navigation
  const handleBack = () => {
    router.push(`/booking/${bookingSlug}`);
  };

  // Loading state
  if (loading) {
    return (
      <div className={styles.viewContainer}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner} />
          <p>Loading service...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={styles.viewContainer}>
        <div className={styles.errorContainer}>
          <h2>Oops!</h2>
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className={styles.retryBtn}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!service) return null;

  const businessName = bookingData?.businessName || "";
  const hasTags = service.tags && service.tags.length > 0;
  const isPopular = hasTags && service.tags?.includes("popular");
  const isNew = hasTags && service.tags?.includes("new");

  // For carousel - support multiple images
  const images = service.imageUrl ? [service.imageUrl] : [];
  // Add placeholder images for demo when only 1 image exists (for coverflow effect)
  const displayImages =
    images.length >= 3
      ? images
      : images.length === 1
        ? [images[0], images[0], images[0]]
        : images.length === 2
          ? [images[0], images[1], images[0]]
          : [];

  // Get slide position class for coverflow effect
  const getSlideClass = (index: number): string => {
    const totalImages = displayImages.length;
    if (totalImages === 0) return styles.slideHidden;

    const diff = index - currentSlide;
    const normalizedDiff = ((diff % totalImages) + totalImages) % totalImages;

    // Handle wrap-around for circular navigation
    if (normalizedDiff === 0) return styles.slideCenter;
    if (
      normalizedDiff === 1 ||
      (normalizedDiff === totalImages - 1 && totalImages === 2)
    )
      return styles.slideRight;
    if (normalizedDiff === totalImages - 1) return styles.slideLeft;
    if (normalizedDiff === 2) return styles.slideFarRight;
    if (normalizedDiff === totalImages - 2) return styles.slideFarLeft;
    return styles.slideHidden;
  };

  const handlePrevSlide = () => {
    if (displayImages.length <= 1) return;
    setCurrentSlide((prev) =>
      prev === 0 ? displayImages.length - 1 : prev - 1,
    );
  };

  const handleNextSlide = () => {
    if (displayImages.length <= 1) return;
    setCurrentSlide((prev) =>
      prev === displayImages.length - 1 ? 0 : prev + 1,
    );
  };

  return (
    <div className={styles.viewContainer}>
      {/* Header */}
      <header className={styles.viewHeader}>
        <div className={styles.headerContent}>
          <button
            className={styles.backBtn}
            onClick={handleBack}
            aria-label="Go back"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className={styles.headerTitle}>{businessName}</h1>
        </div>
      </header>

      {/* Coverflow Image Carousel */}
      <section className={styles.carouselSection}>
        <div className={styles.carouselWrapper}>
          {/* Carousel Track with 3D Slides */}
          <div className={styles.carouselTrack}>
            {displayImages.length > 0 ? (
              displayImages.map((img, index) => (
                <div
                  key={index}
                  className={`${styles.carouselSlide} ${getSlideClass(index)}`}
                  onClick={() => setCurrentSlide(index)}
                >
                  <img
                    src={img}
                    alt={`${service.name} - Image ${index + 1}`}
                    className={styles.slideImage}
                  />
                  <div className={styles.slideOverlay}>
                    <h3 className={styles.slideTitle}>{service.name}</h3>
                  </div>
                </div>
              ))
            ) : (
              <div className={`${styles.carouselSlide} ${styles.slideCenter}`}>
                <div className={styles.slidePlaceholder}>
                  <span>{service.name.charAt(0)}</span>
                </div>
                <div className={styles.slideOverlay}>
                  <h3 className={styles.slideTitle}>{service.name}</h3>
                </div>
              </div>
            )}
          </div>

          {/* Navigation Arrows */}
          {displayImages.length > 1 && (
            <>
              <button
                className={`${styles.carouselNav} ${styles.carouselNavPrev}`}
                onClick={handlePrevSlide}
                aria-label="Previous image"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                className={`${styles.carouselNav} ${styles.carouselNavNext}`}
                onClick={handleNextSlide}
                aria-label="Next image"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Navigation Dots */}
        <div className={styles.carouselDots}>
          {(displayImages.length > 0 ? displayImages : [1]).map((_, index) => (
            <button
              key={index}
              className={`${styles.carouselDot} ${index === currentSlide ? styles.carouselDotActive : ""}`}
              onClick={() => displayImages.length > 1 && setCurrentSlide(index)}
              aria-label={`Go to image ${index + 1}`}
            />
          ))}
        </div>
      </section>

      {/* Content */}
      <section className={styles.contentSection}>
        {service.category && (
          <span className={styles.categoryTag}>{service.category}</span>
        )}
        <h2 className={styles.serviceTitle}>{service.name}</h2>

        {/* Meta Cards */}
        <div className={styles.metaCards}>
          <div className={`${styles.metaCard} ${styles.priceCard}`}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            {formatPrice(service.price)}
          </div>
          <div className={styles.metaCard}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {formatDuration(service.duration)}
          </div>
        </div>

        {/* Description */}
        {service.description && (
          <div className={styles.descriptionSection}>
            <h3 className={styles.sectionLabel}>About this service</h3>
            <p className={styles.description}>{service.description}</p>
          </div>
        )}

        {/* Details */}
        <ul className={styles.detailsList}>
          <li className={styles.detailItem}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span className={styles.detailLabel}>Instant confirmation</span>
          </li>
          <li className={styles.detailItem}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span className={styles.detailLabel}>Flexible scheduling</span>
          </li>
        </ul>
      </section>

      {/* Bottom CTA */}
      <div className={styles.bottomCta}>
        <div className={styles.ctaInner}>
          <div className={styles.ctaPrice}>
            <span className={styles.ctaPriceLabel}>Price</span>
            <span className={styles.ctaPriceValue}>
              {formatPrice(service.price)}
            </span>
          </div>
          <button className={styles.bookNowBtn} onClick={handleBookNow}>
            Book Now
          </button>
        </div>
      </div>
    </div>
  );
}
