"use client";

/**
 * PlanComparisonTable — Feature Matrix with Plan Cards
 * ==================================================
 *
 * Design: Professional grid layout, clean white cards with black text
 * Features: Current plan highlighting, recommended badge, feature differences
 */

import { useState } from "react";
import PlanCard from "./PlanCard";
import FeatureDifferenceModal from "./FeatureDifferenceModal";

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
  billingCycle: "monthly" | "yearly";
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
  const [selectedPlanForDiff, setSelectedPlanForDiff] = useState<string | null>(
    null,
  );

  // Sort plans by tier level
  const sortedPlans = [...availablePlans].sort(
    (a, b) => a.tier_level - b.tier_level,
  );

  return (
    <div className="space-y-8">
      {/* Plans Container */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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
                  differences
                    ? () => setSelectedPlanForDiff(plan.plan_slug)
                    : undefined
                }
              />
            );
          })}
        </div>
      </div>

      {/* Feature Differences Modal */}
      {selectedPlanForDiff && (
        <FeatureDifferenceModal
          planName={
            sortedPlans.find((p) => p.plan_slug === selectedPlanForDiff)
              ?.display_name || ""
          }
          differences={featureDifferences[selectedPlanForDiff]}
          onClose={() => setSelectedPlanForDiff(null)}
          domain={domain}
        />
      )}
    </div>
  );
}
