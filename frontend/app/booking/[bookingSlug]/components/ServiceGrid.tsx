"use client";

import React from "react";
import { motion } from "framer-motion";
import styles from "../booking.module.css";
import ServiceCard, { Service } from "./ServiceCard";

// ============================================================
// Types
// ============================================================
interface ServiceGridProps {
  services: Service[];
  onServiceClick: (service: Service) => void;
}

// ============================================================
// ServiceGrid Component
// ============================================================
export default function ServiceGrid({
  services,
  onServiceClick,
}: ServiceGridProps) {
  // Check for prefers-reduced-motion
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Container animation
  const containerVariants = prefersReducedMotion
    ? {}
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: 0.06,
          },
        },
      };

  // Empty state
  if (services.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyStateIcon}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 15h8M9 9h.01M15 9h.01" />
          </svg>
        </div>
        <h3>No services available</h3>
        <p>Check back later for our service offerings.</p>
      </div>
    );
  }

  return (
    <motion.div
      className={styles.serviceGrid}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {services.map((service, index) => (
        <ServiceCard
          key={service.id}
          service={service}
          onClick={() => onServiceClick(service)}
          index={index}
        />
      ))}
    </motion.div>
  );
}
