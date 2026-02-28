"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductDomain } from "@/lib/domain/config";
import { useAuth } from "@/app/components/auth/AuthProvider";

interface ProductGatePopupProps {
  product: ProductDomain;
  onActivated?: () => void;
}

/**
 * Product descriptions and metadata for the gate popup
 */
const PRODUCT_INFO: Record<
  string,
  {
    name: string;
    icon: string;
    description: string;
    features: string[];
    gradient: string;
    accentColor: string;
  }
> = {
  shop: {
    name: "Flowauxi Shop",
    icon: "🛍️",
    description:
      "Launch your online store with WhatsApp-powered commerce. Manage products, track orders, and grow sales.",
    features: [
      "Product catalog management",
      "Order tracking & fulfillment",
      "WhatsApp order notifications",
      "Inventory management",
      "Payment integration",
    ],
    gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    accentColor: "#764ba2",
  },
  showcase: {
    name: "Flowauxi Showcase",
    icon: "🌐",
    description:
      "Create stunning digital showcase pages for your business. Share your portfolio, services, and contact info.",
    features: [
      "Beautiful page builder",
      "Custom domains",
      "Contact forms",
      "Portfolio showcase",
      "SEO optimized",
    ],
    gradient: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    accentColor: "#f5576c",
  },
  marketing: {
    name: "Flowauxi Marketing",
    icon: "📢",
    description:
      "Supercharge your WhatsApp marketing. Send bulk messages, run campaigns, and grow your audience.",
    features: [
      "Bulk WhatsApp messaging",
      "Campaign management",
      "Message templates",
      "Audience segmentation",
      "Campaign analytics",
    ],
    gradient: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    accentColor: "#4facfe",
  },
  api: {
    name: "Flowauxi API",
    icon: "⚡",
    description:
      "Integrate Flowauxi into your applications with our powerful API.",
    features: [
      "RESTful API",
      "Webhooks",
      "SDK libraries",
      "Developer dashboard",
      "Rate limiting controls",
    ],
    gradient: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    accentColor: "#43e97b",
  },
};

export default function ProductGatePopup({
  product,
  onActivated,
}: ProductGatePopupProps) {
  const router = useRouter();
  const { activateProduct } = useAuth();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = PRODUCT_INFO[product] || PRODUCT_INFO.shop;

  const handleActivate = async () => {
    setActivating(true);
    setError(null);

    try {
      const success = await activateProduct(product);
      if (success) {
        // Dispatch event so SubscriptionGate can recheck
        window.dispatchEvent(new CustomEvent("product-activated"));
        onActivated?.();
      } else {
        setError("Activation failed. Please try again.");
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setActivating(false);
    }
  };

  const handleGoToPricing = () => {
    router.push("/pricing");
  };

  const handleGoBack = () => {
    router.push("/dashboard");
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        {/* Decorative gradient header */}
        <div
          style={{
            ...styles.header,
            background: info.gradient,
          }}
        >
          <div style={styles.iconCircle}>
            <span style={styles.icon}>{info.icon}</span>
          </div>
          <h2 style={styles.title}>{info.name}</h2>
          <p style={styles.subtitle}>Activate to get started</p>
        </div>

        {/* Content */}
        <div style={styles.content}>
          <p style={styles.description}>{info.description}</p>

          {/* Features list */}
          <div style={styles.featuresList}>
            <p style={styles.featuresTitle}>What you get:</p>
            {info.features.map((feature, i) => (
              <div key={i} style={styles.featureItem}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ flexShrink: 0, marginTop: 2 }}
                >
                  <path
                    d="M5 13l4 4L19 7"
                    stroke={info.accentColor}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span style={styles.featureText}>{feature}</span>
              </div>
            ))}
          </div>

          {/* Trial badge */}
          <div style={styles.trialBadge}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
            >
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
            <span style={styles.trialText}>
              14-day free trial included • No credit card needed
            </span>
          </div>

          {/* Error message */}
          {error && (
            <div style={styles.errorBox}>
              <span>{error}</span>
            </div>
          )}

          {/* Action buttons */}
          <div style={styles.actions}>
            <button
              onClick={handleActivate}
              disabled={activating}
              style={{
                ...styles.primaryBtn,
                background: activating ? "#94a3b8" : info.gradient,
                cursor: activating ? "not-allowed" : "pointer",
              }}
            >
              {activating ? (
                <span style={styles.spinnerWrap}>
                  <span style={styles.spinner}></span>
                  Activating...
                </span>
              ) : (
                `Start Free Trial`
              )}
            </button>

            <button onClick={handleGoToPricing} style={styles.secondaryBtn}>
              View Plans & Pricing
            </button>

            <button onClick={handleGoBack} style={styles.linkBtn}>
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Global spinner animation */}
      <style>{`
        @keyframes productGateSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Inline styles (no external CSS dependency) ────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.6)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    padding: "1rem",
  },
  container: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 20,
    overflow: "hidden",
    background: "#ffffff",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
    animation: "fadeIn 0.3s ease-out",
  },
  header: {
    padding: "2.5rem 2rem 2rem",
    textAlign: "center" as const,
    position: "relative" as const,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: "rgba(255, 255, 255, 0.25)",
    backdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 1rem",
    border: "2px solid rgba(255, 255, 255, 0.3)",
  },
  icon: {
    fontSize: 36,
  },
  title: {
    color: "#fff",
    fontSize: "1.5rem",
    fontWeight: 700,
    margin: "0 0 0.25rem",
    letterSpacing: "-0.02em",
  },
  subtitle: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: "0.9rem",
    margin: 0,
    fontWeight: 400,
  },
  content: {
    padding: "1.75rem 2rem 2rem",
  },
  description: {
    color: "#475569",
    fontSize: "0.95rem",
    lineHeight: 1.6,
    margin: "0 0 1.25rem",
  },
  featuresList: {
    marginBottom: "1.25rem",
  },
  featuresTitle: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "#94a3b8",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    margin: "0 0 0.75rem",
  },
  featureItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 8,
  },
  featureText: {
    color: "#334155",
    fontSize: "0.9rem",
    lineHeight: 1.4,
  },
  trialBadge: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#fffbeb",
    border: "1px solid #fde68a",
    borderRadius: 10,
    padding: "0.75rem 1rem",
    marginBottom: "1.25rem",
  },
  trialText: {
    color: "#92400e",
    fontSize: "0.8rem",
    fontWeight: 500,
    lineHeight: 1.4,
  },
  errorBox: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "0.6rem 1rem",
    marginBottom: "1rem",
    color: "#dc2626",
    fontSize: "0.85rem",
  },
  actions: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  },
  primaryBtn: {
    width: "100%",
    padding: "0.85rem",
    border: "none",
    borderRadius: 12,
    color: "#fff",
    fontSize: "1rem",
    fontWeight: 600,
    letterSpacing: "-0.01em",
    transition: "opacity 0.2s, transform 0.15s",
  },
  spinnerWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  spinner: {
    display: "inline-block",
    width: 18,
    height: 18,
    border: "2.5px solid rgba(255,255,255,0.3)",
    borderTopColor: "#fff",
    borderRadius: "50%",
    animation: "productGateSpin 0.6s linear infinite",
  },
  secondaryBtn: {
    width: "100%",
    padding: "0.75rem",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    background: "#f8fafc",
    color: "#475569",
    fontSize: "0.9rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "background 0.2s",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    fontSize: "0.85rem",
    cursor: "pointer",
    padding: "0.5rem",
    textAlign: "center" as const,
    transition: "color 0.2s",
  },
};
