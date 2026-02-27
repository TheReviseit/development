"use client";

/**
 * UpgradeContainer — Main Client Component for Upgrade Flow
 * =========================================================
 *
 * Design: Clean white background with black text, professional spacing
 * State: React Query for server state, local state for UI toggles
 * Features: Domain detection, billing cycle toggle, loading states
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auth } from "@/src/firebase/firebase";
import BillingCycleToggle from "./BillingCycleToggle";
import PlanComparisonTable from "./PlanComparisonTable";
import AddOnsSection from "./AddOnsSection";
import UsageSummary from "./UsageSummary";
import LoadingSkeleton from "./LoadingSkeleton";
import ErrorState from "./ErrorState";

interface UpgradeContainerProps {
  initialDomain: string;
  recommendedPlan?: string;
}

export default function UpgradeContainer({
  initialDomain,
  recommendedPlan,
}: UpgradeContainerProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly",
  );

  // Fetch upgrade options from API
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["upgrade-options", initialDomain, billingCycle],
    queryFn: async () => {
      // Get Firebase auth user ID
      const user = auth.currentUser;
      if (!user) {
        throw new Error("Not authenticated");
      }

      const res = await fetch(
        `/api/upgrade/options?domain=${initialDomain}&billing_cycle=${billingCycle}`,
        {
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "X-User-Id": user.uid, // Send Firebase UID, not JWT token
          },
        },
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to fetch upgrade options");
      }

      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
    retry: 2,
  });

  // Loading state
  if (isLoading) {
    return <LoadingSkeleton />;
  }

  // Error state
  if (error) {
    return <ErrorState error={error as Error} onRetry={() => refetch()} />;
  }

  // Destructure response data
  const {
    current_plan,
    available_plans,
    recommended_plan,
    feature_differences,
    available_addons,
    usage_summary,
  } = data || {};

  return (
    <div className="space-y-8">
      {/* Billing Cycle Toggle — hidden for now (monthly only) */}
      {/* <div className="flex justify-center">
        <BillingCycleToggle
          value={billingCycle}
          onChange={setBillingCycle}
          savingsPercent={20}
        />
      </div> */}

      {/* Usage Summary (if user has current plan) */}
      {current_plan && usage_summary && (
        <UsageSummary currentPlan={current_plan} usage={usage_summary} />
      )}

      {/* Plan Comparison Table */}
      <PlanComparisonTable
        currentPlan={current_plan}
        availablePlans={available_plans || []}
        recommendedPlan={recommended_plan || recommendedPlan}
        featureDifferences={feature_differences || {}}
        billingCycle={billingCycle}
        domain={initialDomain}
      />

      {/* Add-Ons Section (if available) */}
      {available_addons && available_addons.length > 0 && (
        <AddOnsSection addons={available_addons} domain={initialDomain} />
      )}

      {/* Enterprise Contact CTA — Professional Card */}
      <div className="mt-12 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto max-w-md">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-900">
            <svg
              className="h-6 w-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900">
            Need a Custom Plan?
          </h3>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            For enterprise requirements, custom integrations, or volume
            discounts — let&apos;s talk.
          </p>
          <a
            href="https://wa.me/916383634873?text=Hi%2C%20I%27m%20interested%20in%20a%20custom%20plan%20for%20Flowauxi"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 transition-colors duration-150"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.638l4.67-1.23A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.593-.813-6.348-2.18a.5.5 0 00-.416-.083l-3.136.827.672-2.461a.5.5 0 00-.064-.432A9.96 9.96 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
            </svg>
            Contact Sales on WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
