'use client';

/**
 * PlanComparisonTable — Feature Matrix with Plan Cards
 * ==================================================
 *
 * Design: Professional grid layout, clean white cards with black text
 * Features: Current plan highlighting, recommended badge, feature differences
 */

import { useState } from 'react';
import PlanCard from './PlanCard';
import FeatureDifferenceModal from './FeatureDifferenceModal';

interface Plan {
  plan_slug: string;
  display_name: string;
  amount_paise: number;
  amount_yearly_paise?: number;
  tier_level: number;
  tagline?: string;
  requires_sales_call?: boolean;
  features?: Array<{
    feature_key: string;
    hard_limit?: number | null;
    display: string;
  }>;
}

interface PlanComparisonTableProps {
  currentPlan: Plan | null;
  availablePlans: Plan[];
  recommendedPlan: Plan | null;
  featureDifferences: Record<string, any>;
  billingCycle: 'monthly' | 'yearly';
  domain: string;
}

export default function PlanComparisonTable({
  currentPlan,
  availablePlans,
  recommendedPlan,
  featureDifferences,
  billingCycle,
  domain,
}: PlanComparisonTableProps) {
  const [selectedPlanForDiff, setSelectedPlanForDiff] = useState<string | null>(null);

  // Sort plans by tier level
  const sortedPlans = [...availablePlans].sort((a, b) => a.tier_level - b.tier_level);

  return (
    <div className="space-y-8">
      {/* Plans Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 xl:grid-cols-4">
        {sortedPlans.map((plan) => {
          const isCurrent = currentPlan?.plan_slug === plan.plan_slug;
          const isRecommended = recommendedPlan?.plan_slug === plan.plan_slug;
          const differences = featureDifferences[plan.plan_slug];

          return (
            <PlanCard
              key={plan.plan_slug}
              plan={plan}
              isCurrent={isCurrent}
              isRecommended={isRecommended}
              billingCycle={billingCycle}
              domain={domain}
              onViewDifferences={
                differences ? () => setSelectedPlanForDiff(plan.plan_slug) : undefined
              }
            />
          );
        })}
      </div>

      {/* Feature Differences Modal */}
      {selectedPlanForDiff && (
        <FeatureDifferenceModal
          planName={sortedPlans.find((p) => p.plan_slug === selectedPlanForDiff)?.display_name || ''}
          differences={featureDifferences[selectedPlanForDiff]}
          onClose={() => setSelectedPlanForDiff(null)}
        />
      )}

      {/* Feature Comparison Legend */}
      {currentPlan && (
        <div className="mt-8 border-t border-gray-200 pt-8">
          <h3 className="text-lg font-semibold text-black mb-4">
            What's Included
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Extract all unique features from all plans */}
            {Array.from(
              new Set(
                sortedPlans.flatMap((p) => p.features?.map((f) => f.feature_key) || [])
              )
            ).map((featureKey) => {
              // Find feature in any plan for display name
              const feature = sortedPlans
                .flatMap((p) => p.features || [])
                .find((f) => f.feature_key === featureKey);

              if (!feature) return null;

              return (
                <div key={featureKey} className="flex items-start space-x-3">
                  <svg
                    className="h-5 w-5 text-black mt-0.5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-black">
                      {feature.display}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
