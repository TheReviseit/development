"use client";

import React, { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import styles from "../booking.module.css";
import { Service } from "./ServiceCard";

// ============================================================
// Types
// ============================================================
interface ServiceDetailModalProps {
  service: Service | null;
  isOpen: boolean;
  onClose: () => void;
  onBookNow: (service: Service) => void;
}

// ============================================================
// Helper Functions
// ============================================================
function formatPrice(price: number, currency: string = "INR"): string {
  if (price === 0) return "FREE";
  if (currency === "INR") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 0,
  }).format(price);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0
    ? `${hours} hour ${mins} min`
    : `${hours} hour${hours > 1 ? "s" : ""}`;
}

// ============================================================
// ServiceDetailModal Component
// ============================================================
export default function ServiceDetailModal({
  service,
  isOpen,
  onClose,
  onBookNow,
}: ServiceDetailModalProps) {
  // Check for prefers-reduced-motion
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Handle ESC key to close
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!service) return null;

  // Animation variants
  const backdropVariants = prefersReducedMotion
    ? { visible: { opacity: 1 }, hidden: { opacity: 0 } }
    : {
        visible: { opacity: 1 },
        hidden: { opacity: 0 },
      };

  const modalVariants = prefersReducedMotion
    ? {
        visible: { opacity: 1 },
        hidden: { opacity: 0 },
        exit: { opacity: 0 },
      }
    : {
        hidden: { opacity: 0, y: 50, scale: 0.95 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: {
            type: "spring",
            damping: 25,
            stiffness: 300,
          },
        },
        exit: {
          opacity: 0,
          y: 30,
          scale: 0.95,
          transition: { duration: 0.2 },
        },
      };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className={styles.modalBackdrop}
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            onClick={onClose}
          />

          {/* Modal Content */}
          <motion.div
            className={styles.serviceDetailModal}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              className={styles.modalCloseBtn}
              onClick={onClose}
              aria-label="Close modal"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Hero Image */}
            <div className={styles.modalHeroImage}>
              {service.imageUrl ? (
                <Image
                  src={service.imageUrl}
                  alt={service.name}
                  fill
                  className={styles.modalImg}
                  priority
                />
              ) : (
                <div className={styles.modalPlaceholder}>
                  <span>{service.name.charAt(0).toUpperCase()}</span>
                </div>
              )}

              {/* Badges on image */}
              <div className={styles.modalBadges}>
                {service.isPopular && (
                  <span
                    className={`${styles.serviceBadge} ${styles.badgePopular}`}
                  >
                    ⭐ Popular
                  </span>
                )}
                {service.isNew && (
                  <span className={`${styles.serviceBadge} ${styles.badgeNew}`}>
                    ✨ New
                  </span>
                )}
                {service.limitedSlots && (
                  <span
                    className={`${styles.serviceBadge} ${styles.badgeLimited}`}
                  >
                    🔥 Limited Slots
                  </span>
                )}
              </div>
            </div>

            {/* Modal Body */}
            <div className={styles.modalBody}>
              {/* Category */}
              {service.category && (
                <span className={styles.modalCategory}>{service.category}</span>
              )}

              {/* Title */}
              <h2 className={styles.modalTitle}>{service.name}</h2>

              {/* Meta Badges */}
              <div className={styles.modalMetaBadges}>
                <div className={styles.metaBadge}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12,6 12,12 16,14" />
                  </svg>
                  <span>{formatDuration(service.duration)}</span>
                </div>
                <div className={styles.metaBadge}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                  <span>{formatPrice(service.price, service.currency)}</span>
                </div>
              </div>

              {/* Description */}
              <div className={styles.modalDescription}>
                <h3>About this service</h3>
                <p>
                  {service.description ||
                    "No detailed description available for this service. Book now to experience our premium offering."}
                </p>
              </div>
            </div>

            {/* Sticky Footer with Book Now Button (especially for mobile) */}
            <div className={styles.modalFooter}>
              <div className={styles.modalPriceDisplay}>
                <span className={styles.priceLabel}>Price</span>
                <span className={styles.priceValue}>
                  {formatPrice(service.price, service.currency)}
                </span>
              </div>
              <button
                className={styles.bookNowBtn}
                onClick={() => onBookNow(service)}
              >
                Book Now
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
