'use client';

/**
 * UpgradeContainer — Main Client Component for Upgrade Flow
 * =========================================================
 *
 * Design: Clean white background with black text, professional spacing
 * State: React Query for server state, local state for UI toggles
 * Features: Domain detection, billing cycle toggle, loading states
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auth } from '@/src/firebase/firebase';
import BillingCycleToggle from './BillingCycleToggle';
import PlanComparisonTable from './PlanComparisonTable';
import AddOnsSection from './AddOnsSection';
import UsageSummary from './UsageSummary';
import LoadingSkeleton from './LoadingSkeleton';
import ErrorState from './ErrorState';

interface UpgradeContainerProps {
  initialDomain: string;
  recommendedPlan?: string;
}

export default function UpgradeContainer({
  initialDomain,
  recommendedPlan,
}: UpgradeContainerProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  // Fetch upgrade options from API
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['upgrade-options', initialDomain, billingCycle],
    queryFn: async () => {
      // Get Firebase auth user ID
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Not authenticated');
      }

      const res = await fetch(
        `/api/upgrade/options?domain=${initialDomain}&billing_cycle=${billingCycle}`,
        {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': user.uid, // Send Firebase UID, not JWT token
          },
        }
      );

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to fetch upgrade options');
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
    return (
      <ErrorState
        error={error as Error}
        onRetry={() => refetch()}
      />
    );
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
      {/* Billing Cycle Toggle */}
      <div className="flex justify-center">
        <BillingCycleToggle
          value={billingCycle}
          onChange={setBillingCycle}
          savingsPercent={20}
        />
      </div>

      {/* Usage Summary (if user has current plan) */}
      {current_plan && usage_summary && (
        <UsageSummary
          currentPlan={current_plan}
          usage={usage_summary}
        />
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
        <AddOnsSection
          addons={available_addons}
          domain={initialDomain}
        />
      )}

      {/* Enterprise Contact CTA */}
      <div className="mt-16 border-t border-gray-200 pt-12">
        <div className="text-center">
          <h3 className="text-2xl font-bold text-black mb-4">
            Need a Custom Plan?
          </h3>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
            For enterprise requirements, custom integrations, or volume discounts,
            contact our sales team for a tailored solution.
          </p>
          <a
            href="mailto:sales@flowauxi.com"
            className="inline-flex items-center px-8 py-3 border border-black text-base font-medium text-black bg-white hover:bg-gray-50 transition-colors duration-200"
          >
            Contact Sales
          </a>
        </div>
      </div>
    </div>
  );
}
