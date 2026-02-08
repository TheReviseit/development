"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import styles from "../booking.module.css";

// ============================================================
// Types
// ============================================================
export interface Service {
  id: string;
  name: string;
  description?: string;
  duration: number; // in minutes
  price: number;
  originalPrice?: number; // For showing discount
  currency?: string;
  imageUrl?: string;
  category?: string;
  isPopular?: boolean;
  isNew?: boolean;
  limitedSlots?: boolean;
  available?: boolean;
  rating?: number;
}

interface ServiceCardProps {
  service: Service;
  onClick: () => void;
  index: number;
}

// ============================================================
// Helper Functions
// ============================================================
function formatPrice(price: number, currency: string = "INR"): string {
  if (price === 0) return "FREE";
  if (currency === "INR") {
    return `₹${price.toLocaleString("en-IN")}`;
  }
  return `$${price.toLocaleString("en-US")}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function truncateText(text: string, maxLength: number = 80): string {
  if (!text || text.length <= maxLength) return text || "";
  return text.substring(0, maxLength).trim() + "...";
}

function calculateDiscount(original: number, current: number): number {
  if (!original || original <= current) return 0;
  return Math.round(((original - current) / original) * 100);
}

// ============================================================
// ServiceCard Component - Premium Design
// ============================================================
export default function ServiceCard({
  service,
  onClick,
  index,
}: ServiceCardProps) {
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Staggered loading effect
  useEffect(() => {
    const timer = setTimeout(
      () => {
        setIsLoading(false);
      },
      300 + index * 50,
    );
    return () => clearTimeout(timer);
  }, [index]);

  // Check for prefers-reduced-motion
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Animation variants
  const cardVariants = prefersReducedMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: 16 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.35,
            delay: index * 0.06,
            ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
          },
        },
        hover: {
          y: -6,
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.15)",
          transition: { duration: 0.25 },
        },
        tap: { scale: 0.98 },
      };

  const discount = calculateDiscount(service.originalPrice || 0, service.price);

  // Skeleton loading state
  if (isLoading) {
    return (
      <div className={styles.premiumCard}>
        <div className={`${styles.premiumCardImage} ${styles.skeleton}`} />
        <div className={styles.premiumCardBody}>
          <div className={`${styles.skeletonText} ${styles.skeletonTitle}`} />
          <div className={`${styles.skeletonText} ${styles.skeletonDesc}`} />
          <div className={styles.skeletonPrice} />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className={styles.premiumCard}
      onClick={onClick}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={prefersReducedMotion ? undefined : "hover"}
      whileTap={prefersReducedMotion ? undefined : "tap"}
    >
      {/* Image Section */}
      <div className={styles.premiumCardImage}>
        {service.imageUrl ? (
          <>
            {!isImageLoaded && (
              <div
                className={`${styles.imagePlaceholder} ${styles.skeleton}`}
              />
            )}
            <Image
              src={service.imageUrl}
              alt={service.name}
              fill
              className={`${styles.premiumImg} ${isImageLoaded ? styles.imageLoaded : ""}`}
              onLoad={() => setIsImageLoaded(true)}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </>
        ) : (
          <div className={styles.premiumPlaceholder}>
            <span>{service.name.charAt(0).toUpperCase()}</span>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className={styles.premiumCardBody}>
        {/* Title */}
        <h3 className={styles.premiumCardTitle}>{service.name}</h3>

        {/* Description/Category */}
        <p className={styles.premiumCardDesc}>
          {service.description
            ? truncateText(service.description)
            : service.category || "Service"}
        </p>

        {/* Price Section */}
        <div className={styles.premiumCardFooter}>
          <div className={styles.premiumPriceRow}>
            {/* Original Price (if discount) */}
            {discount > 0 && service.originalPrice && (
              <span className={styles.premiumOriginalPrice}>
                {formatPrice(service.originalPrice, service.currency)}
              </span>
            )}
            {/* Current Price */}
            <span className={styles.premiumPrice}>
              {formatPrice(service.price, service.currency)}
            </span>
            {/* Discount Badge */}
            {discount > 0 && (
              <span className={styles.premiumDiscount}>{discount}% OFF</span>
            )}
          </div>

          {/* Duration & Rating Row */}
          <div className={styles.premiumMetaRow}>
            <span className={styles.premiumDuration}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12,6 12,12 16,14" />
              </svg>
              {formatDuration(service.duration)}
            </span>
            {service.rating && (
              <span className={styles.premiumRating}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="#ef4444"
                  stroke="none"
                >
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                {service.rating}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
