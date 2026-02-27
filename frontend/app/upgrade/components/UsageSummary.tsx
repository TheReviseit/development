'use client';

/**
 * UsageSummary — Current Usage Display
 * ===================================
 *
 * Design: Clean progress bars showing usage vs limits
 */

interface UsageSummaryProps {
  currentPlan: {
    display_name: string;
    plan_slug: string;
  };
  usage: Record<string, number>;
}

export default function UsageSummary({ currentPlan, usage }: UsageSummaryProps) {
  // Don't show if no usage data
  if (!usage || Object.keys(usage).length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border-2 border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-black mb-4">
        Current Usage on {currentPlan.display_name}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(usage).map(([feature, count]) => (
          <div key={feature} className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-700 capitalize">
                {feature.replace(/_/g, ' ')}
              </span>
              <span className="font-medium text-black">{count}</span>
            </div>
            {/* Progress bar placeholder - would need limits from API to show properly */}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-black transition-all duration-300"
                style={{ width: `${Math.min(100, count)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
