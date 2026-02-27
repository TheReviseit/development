"use client";

/**
 * FeatureDifferenceModal — Premium Feature Changes Display
 * ========================================================
 *
 * Production-grade modal showing gained/lost features and limit changes
 * when upgrading plans. Filters out platform features and zero-change items.
 *
 * Design: Glassmorphism backdrop, categorized sections, colored delta badges
 */

import { useEffect, useRef } from "react";

// ─── Feature Display Config ────────────────────────────────────────────────────
// Maps raw feature_keys to human-friendly labels and categories.
// Features NOT in this map are hidden (platform/shared features like otp_send).

// Domain-specific exclusion: features irrelevant to each domain
const DOMAIN_EXCLUDED_FEATURES: Record<string, string[]> = {
  shop: ["campaign_sends", "bulk_messaging", "template_builder"],
  marketing: [
    "create_product",
    "custom_domain",
    "invoice_customization",
    "google_sheets_sync",
  ],
  dashboard: [],
  showcase: ["campaign_sends", "bulk_messaging", "create_product"],
  api: ["campaign_sends", "bulk_messaging", "create_product", "custom_domain"],
};

interface FeatureDisplayInfo {
  label: string;
  category: "shop" | "communication" | "integration" | "support";
  icon: string; // emoji
}

const FEATURE_DISPLAY_MAP: Record<string, FeatureDisplayInfo> = {
  // Shop Features
  create_product: { label: "Products", category: "shop", icon: "📦" },
  custom_domain: { label: "Custom Domain", category: "shop", icon: "🌐" },
  invoice_customization: {
    label: "Invoice Customization",
    category: "shop",
    icon: "🧾",
  },
  advanced_analytics: {
    label: "Advanced Analytics",
    category: "shop",
    icon: "📊",
  },
  white_label: { label: "White Label Branding", category: "shop", icon: "🏷️" },
  multi_staff: { label: "Multi-Staff Access", category: "shop", icon: "👥" },

  // Communication
  ai_responses: {
    label: "AI Responses",
    category: "communication",
    icon: "🤖",
  },
  email_invoices: {
    label: "Email Invoices",
    category: "communication",
    icon: "📧",
  },
  live_order_updates: {
    label: "Live Order Updates",
    category: "communication",
    icon: "🔔",
  },
  message_history_days: {
    label: "Message History Days",
    category: "communication",
    icon: "💬",
  },
  faqs: { label: "FAQ Entries", category: "communication", icon: "❓" },
  campaign_sends: {
    label: "Campaign Sends",
    category: "communication",
    icon: "📢",
  },
  bulk_messaging: {
    label: "Bulk Messaging",
    category: "communication",
    icon: "📨",
  },
  template_builder: {
    label: "Template Builder",
    category: "communication",
    icon: "📝",
  },

  // Integrations
  google_sheets_sync: {
    label: "Google Sheets Sync",
    category: "integration",
    icon: "📗",
  },
  webhooks: { label: "Webhooks", category: "integration", icon: "🔗" },
  api_access: { label: "API Access", category: "integration", icon: "⚡" },

  // Support
  priority_support: {
    label: "Priority Support",
    category: "support",
    icon: "🎯",
  },
};

const CATEGORY_CONFIG: Record<string, { title: string; icon: string }> = {
  shop: { title: "Store & Products", icon: "🛍️" },
  communication: { title: "Communication", icon: "💬" },
  integration: { title: "Integrations", icon: "🔌" },
  support: { title: "Support", icon: "🛟" },
};

// ─── Types ──────────────────────────────────────────────────────────────────────

interface FeatureDifferences {
  gained?: string[];
  lost?: string[];
  limit_changes?: Record<string, { from: number; to: number }>;
}

interface FeatureDifferenceModalProps {
  planName: string;
  differences: FeatureDifferences;
  onClose: () => void;
  domain?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getFeatureLabel(key: string): string {
  return (
    FEATURE_DISPLAY_MAP[key]?.label ||
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function isVisibleFeature(key: string, domain?: string): boolean {
  if (!(key in FEATURE_DISPLAY_MAP)) return false;
  // Domain-specific exclusion
  if (domain) {
    const excluded = DOMAIN_EXCLUDED_FEATURES[domain] || [];
    if (excluded.includes(key)) return false;
  }
  return true;
}

function formatLimit(value: number | null | undefined): string {
  if (value === null || value === undefined) return "∞";
  if (value === 0) return "0";
  return value.toLocaleString("en-IN");
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function FeatureDifferenceModal({
  planName,
  differences,
  onClose,
  domain,
}: FeatureDifferenceModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  // ─── Filter & categorize limit changes ────────────────────────────────────
  const meaningfulLimitChanges = Object.entries(differences.limit_changes || {})
    .filter(([key, change]) => {
      if (!isVisibleFeature(key, domain)) return false;
      // Hide zero→zero (no actual change)
      if (change.from === 0 && change.to === 0) return false;
      // Hide identical values
      if (change.from === change.to) return false;
      return true;
    })
    .sort((a, b) => {
      const catA = FEATURE_DISPLAY_MAP[a[0]]?.category || "z";
      const catB = FEATURE_DISPLAY_MAP[b[0]]?.category || "z";
      return catA.localeCompare(catB);
    });

  // Group limit changes by category
  const limitsByCategory: Record<
    string,
    Array<[string, { from: number; to: number }]>
  > = {};
  for (const entry of meaningfulLimitChanges) {
    const cat = FEATURE_DISPLAY_MAP[entry[0]]?.category || "other";
    if (!limitsByCategory[cat]) limitsByCategory[cat] = [];
    limitsByCategory[cat].push(entry);
  }

  // ─── Filter gained/lost features ──────────────────────────────────────────
  const gainedFeatures = (differences.gained || []).filter((f) =>
    isVisibleFeature(f, domain),
  );
  const lostFeatures = (differences.lost || []).filter((f) =>
    isVisibleFeature(f, domain),
  );

  const hasContent =
    meaningfulLimitChanges.length > 0 ||
    gainedFeatures.length > 0 ||
    lostFeatures.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: "modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div
          className="px-6 py-5 border-b border-gray-100"
          style={{
            background: "linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                What you'll get
              </p>
              <h3 className="text-xl font-bold text-gray-900">
                Upgrading to {planName}
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-200 transition-colors duration-150"
              aria-label="Close"
            >
              <svg
                className="h-5 w-5 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div
          className="px-6 py-6 overflow-y-auto"
          style={{ maxHeight: "calc(85vh - 160px)" }}
        >
          {!hasContent ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">
                No significant feature changes for this upgrade.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* ── Limit Changes (by category) ─────────────────────────── */}
              {Object.keys(limitsByCategory).length > 0 && (
                <div className="space-y-6">
                  {Object.entries(limitsByCategory).map(
                    ([category, entries]) => {
                      const catConfig = CATEGORY_CONFIG[category];
                      return (
                        <div key={category}>
                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            {catConfig?.title || category}
                          </h4>
                          <div className="space-y-0 rounded-xl border border-gray-100 overflow-hidden">
                            {entries.map(([feature, change], idx) => {
                              const delta = change.to - change.from;
                              const isIncrease = delta > 0;
                              return (
                                <div
                                  key={feature}
                                  className={`flex items-center justify-between px-4 py-3 ${idx > 0 ? "border-t border-gray-100" : ""}`}
                                  style={{
                                    backgroundColor:
                                      idx % 2 === 0 ? "#fafafa" : "#ffffff",
                                  }}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
                                      {idx + 1}
                                    </span>
                                    <span className="text-sm font-medium text-gray-800">
                                      {getFeatureLabel(feature)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-500">
                                      <span className="font-semibold text-gray-700">
                                        {formatLimit(change.from)}
                                      </span>
                                      {" → "}
                                      <span className="font-semibold text-gray-900">
                                        {formatLimit(change.to)}
                                      </span>
                                    </span>
                                    {delta !== 0 && (
                                      <span
                                        className={`
                                        inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold
                                        ${
                                          isIncrease
                                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                            : "bg-red-50 text-red-700 border border-red-200"
                                        }
                                      `}
                                      >
                                        {isIncrease ? "+" : ""}
                                        {formatLimit(delta)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              )}

              {/* ── New Features ─────────────────────────────────────────── */}
              {gainedFeatures.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                      <svg
                        className="w-3.5 h-3.5 text-emerald-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 6v12m6-6H6"
                        />
                      </svg>
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                      New Features Unlocked
                    </h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {gainedFeatures.map((feature, idx) => {
                      return (
                        <div
                          key={feature}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-emerald-100"
                          style={{ backgroundColor: "#f0fdf4" }}
                        >
                          <svg
                            className="w-4 h-4 text-emerald-600 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          <span className="text-sm font-medium text-emerald-800">
                            {getFeatureLabel(feature)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Removed Features ─────────────────────────────────────── */}
              {lostFeatures.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                      <svg
                        className="w-3.5 h-3.5 text-red-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M20 12H4"
                        />
                      </svg>
                    </div>
                    <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                      Features Not Included
                    </h4>
                  </div>
                  <div className="space-y-1">
                    {lostFeatures.map((feature) => {
                      const info = FEATURE_DISPLAY_MAP[feature];
                      return (
                        <div
                          key={feature}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                          style={{ backgroundColor: "#fef2f2" }}
                        >
                          <svg
                            className="w-4 h-4 text-red-400 flex-shrink-0"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                          <span className="text-sm text-red-700">
                            {getFeatureLabel(feature)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 active:bg-gray-950 transition-colors duration-150 shadow-sm"
          >
            Got it
          </button>
        </div>
      </div>

      {/* ── Animation Keyframes ─────────────────────────────────────────── */}
      <style jsx global>{`
        @keyframes modalSlideUp {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
}
