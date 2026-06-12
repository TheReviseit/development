"use client";

/**
 * SoftLimitBanner — Proactive Limit Warning System
 * ==============================================
 *
 * Design: Clean warning banner with white background, black text
 * Features: Dismissible, localStorage persistence, multiple feature warnings
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { auth } from "@/src/firebase/firebase";

const DISMISSAL_KEY = "soft_limit_dismissals";
const DISMISSAL_EXPIRY_DAYS = 7;

interface Dismissals {
  [featureKey: string]: number; // timestamp
}

function getDismissals(): Dismissals {
  if (typeof window === "undefined") return {};

  try {
    const stored = localStorage.getItem(DISMISSAL_KEY);
    if (!stored) return {};

    const dismissals = JSON.parse(stored);
    const now = Date.now();

    // Filter expired dismissals
    return Object.fromEntries(
      Object.entries(dismissals).filter(([_, timestamp]) => {
        return now - (timestamp as number) < DISMISSAL_EXPIRY_DAYS * 86400000;
      }),
    ) as Dismissals;
  } catch {
    return {};
  }
}

function dismissFeature(featureKey: string) {
  if (typeof window === "undefined") return;

  try {
    const dismissals = getDismissals();
    dismissals[featureKey] = Date.now();
    localStorage.setItem(DISMISSAL_KEY, JSON.stringify(dismissals));
  } catch (e) {
    console.error("Failed to save dismissal:", e);
  }
}

interface Warning {
  feature: string;
  message: string;
  used: number;
  limit: number;
  upgradeMessage: string;
}

export default function SoftLimitBanner() {
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [dismissed, setDismissed] = useState<Dismissals>({});

  useEffect(() => {
    // Load dismissals from localStorage
    setDismissed(getDismissals());

    // Fetch current usage from API
    fetchUsageWarnings();
  }, []);

  const fetchUsageWarnings = async () => {
    try {
      // Get Firebase auth user ID
      const user = auth.currentUser;
      if (!user) {
        console.warn("User not authenticated, skipping usage warnings fetch");
        return;
      }

      const res = await fetch("/api/features/usage", {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": user.uid, // Send Firebase UID, not JWT token
        },
      });

      if (!res.ok) return;

      const data = await res.json();

      // Check for soft limit exceeded features
      const newWarnings: Warning[] = [];

      if (data.usage) {
        data.usage.forEach((feature: any) => {
          if (feature.soft_limit_exceeded && !feature.hard_limit_exceeded) {
            newWarnings.push({
              feature: feature.feature_key,
              message: `You've used ${feature.used}/${feature.hard_limit} ${feature.feature_key.replace(/_/g, " ")}`,
              used: feature.used,
              limit: feature.hard_limit,
              upgradeMessage: "Upgrade for higher limits",
            });
          }
        });
      }

      setWarnings(newWarnings);
    } catch (e) {
      console.error("Failed to fetch usage warnings:", e);
    }
  };

  const handleDismiss = (featureKey: string) => {
    dismissFeature(featureKey);
    setDismissed({ ...dismissed, [featureKey]: Date.now() });
  };

  // Filter out dismissed warnings
  const activeWarnings = warnings.filter((w) => !dismissed[w.feature]);

  if (activeWarnings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 mb-6">
      {activeWarnings.map((warning) => (
        <div
          key={warning.feature}
          className="flex items-center justify-between p-4 border-2 border-yellow-400 bg-yellow-50 rounded-lg"
        >
          <div className="flex items-start space-x-3 flex-1">
            {/* Warning Icon */}
            <svg
              className="h-6 w-6 text-yellow-600 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>

            {/* Warning Content */}
            <div className="flex-1">
              <p className="text-sm font-semibold text-black">
                {warning.message}
              </p>
              <p className="text-sm text-gray-700 mt-1">
                {warning.upgradeMessage}
              </p>

              {/* Progress Bar */}
              <div className="mt-2 h-2 bg-white rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-600 transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (warning.used / warning.limit) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2 ml-4">
            <Link
              href={`/upgrade?recommended=business`}
              className="px-4 py-2 bg-black text-white text-sm font-medium hover:bg-gray-800 transition-colors duration-200 whitespace-nowrap"
            >
              Upgrade Now
            </Link>
            <button
              onClick={() => handleDismiss(warning.feature)}
              className="p-2 text-gray-600 hover:text-black transition-colors"
              title="Dismiss"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
