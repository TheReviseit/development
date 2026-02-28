"use client";

/**
 * SubscriptionGateOverlay — Full-Screen Domain Access Block
 * =============================================================
 * PRODUCTION-GRADE: This is NOT an overlay on top of content.
 * The dashboard layout early-returns this component with ZERO
 * dashboard content behind it. There is literally nothing in
 * the DOM to delete or bypass via DevTools.
 *
 * Architecture:
 *   - Layout detects isDomainGated → returns ONLY this component
 *   - No sidebar, no menu, no children, no API data rendered
 *   - The only actions available: Get Access or Go Back
 *
 * Usage:
 *   if (isDomainGated) return <SubscriptionGateOverlay ... />
 */

import { memo, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import styles from "./SubscriptionGateOverlay.module.css";

// =============================================================================
// DOMAIN METADATA — Product-specific display config
// =============================================================================

interface DomainMeta {
  label: string;
  description: string;
  features: string[];
  icon: React.ReactNode;
  gradientColor: string;
}

const DOMAIN_METADATA: Record<string, DomainMeta> = {
  shop: {
    label: "FlowAuxi Shop",
    description:
      "Manage products, process orders, and run your e-commerce store with AI-powered WhatsApp integration.",
    features: [
      "Product catalog management",
      "Order processing & tracking",
      "Inventory management",
      "AI-powered customer support",
    ],
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
        />
      </svg>
    ),
    gradientColor: "#6366f1",
  },

  marketing: {
    label: "FlowAuxi Marketing",
    description:
      "Launch bulk WhatsApp campaigns, manage templates, and grow your audience with intelligent marketing tools.",
    features: [
      "Bulk WhatsApp messaging",
      "Campaign management",
      "Message template builder",
      "Audience segmentation",
    ],
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
        />
      </svg>
    ),
    gradientColor: "#8b5cf6",
  },

  showcase: {
    label: "FlowAuxi Pages",
    description:
      "Build beautiful showcase pages and portfolios to display your business offerings to the world.",
    features: [
      "Drag-and-drop page builder",
      "Portfolio & showcase layouts",
      "SEO-optimized pages",
      "Custom domain support",
    ],
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
        />
      </svg>
    ),
    gradientColor: "#a78bfa",
  },

  api: {
    label: "FlowAuxi API",
    description:
      "Access OTP APIs, developer console, and build custom integrations with our enterprise-grade platform.",
    features: [
      "OTP verification API",
      "Developer console",
      "API key management",
      "Real-time analytics",
    ],
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
      </svg>
    ),
    gradientColor: "#6366f1",
  },
};

// =============================================================================
// COMPONENT
// =============================================================================

interface SubscriptionGateOverlayProps {
  currentDomain: string;
  userEmail?: string;
}

const SubscriptionGateOverlay = memo(function SubscriptionGateOverlay({
  currentDomain,
  userEmail,
}: SubscriptionGateOverlayProps) {
  const router = useRouter();

  const meta = useMemo(
    () =>
      DOMAIN_METADATA[currentDomain] || {
        label: "This Product",
        description: "You need a subscription to access this product.",
        features: [],
        icon: null,
        gradientColor: "#6366f1",
      },
    [currentDomain],
  );

  const handleGetAccess = useCallback(() => {
    router.push(`/pricing?product=${currentDomain}`);
  }, [router, currentDomain]);

  const handleGoBack = useCallback(() => {
    if (typeof window !== "undefined") {
      const isDev = window.location.hostname.includes("localhost");
      if (isDev) {
        window.location.href = "http://localhost:3000/dashboard";
      } else {
        window.location.href = "https://flowauxi.com/dashboard";
      }
    }
  }, []);

  // Lock icon for badge
  const LockIcon = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );

  // Check icon for feature items
  const CheckIcon = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );

  // Arrow icon for CTA
  const ArrowIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 7l5 5m0 0l-5 5m5-5H6"
      />
    </svg>
  );

  return (
    <div className={styles.gateOverlay}>
      <div className={styles.gateCard}>
        <div className={styles.gateContent}>
          {/* Product Icon with Lock Badge */}
          {meta.icon && (
            <div className={styles.gateIconWrapper}>
              {meta.icon}
              <span className={styles.gateLockBadge}>{LockIcon}</span>
            </div>
          )}

          {/* Title */}
          <h1 className={styles.gateTitle}>
            You haven&apos;t subscribed to{" "}
            <span className={styles.gateDomainHighlight}>{meta.label}</span>
          </h1>

          {/* Subtitle */}
          <p className={styles.gateSubtitle}>{meta.description}</p>

          {/* Feature List */}
          {meta.features.length > 0 && (
            <ul className={styles.gateFeatures}>
              {meta.features.map((feature, idx) => (
                <li key={idx} className={styles.gateFeatureItem}>
                  <span className={styles.gateFeatureCheck}>{CheckIcon}</span>
                  {feature}
                </li>
              ))}
            </ul>
          )}

          {/* CTA Button */}
          <button
            className={styles.gateCTA}
            onClick={handleGetAccess}
            id="subscription-gate-cta"
          >
            Get {meta.label}
            {ArrowIcon}
          </button>

          {/* Secondary: Go back to dashboard */}
          <button className={styles.gateSecondary} onClick={handleGoBack}>
            ← Go back to main dashboard
          </button>
        </div>

        {/* Footer */}
        <div className={styles.gateFooter}>
          <p className={styles.gateFooterText}>
            Logged in as{" "}
            <span className={styles.gateFooterEmail}>
              {userEmail || "user"}
            </span>{" "}
            · This product requires a separate subscription
          </p>
        </div>
      </div>
    </div>
  );
});

export default SubscriptionGateOverlay;
