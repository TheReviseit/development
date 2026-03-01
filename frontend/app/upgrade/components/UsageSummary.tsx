'use client';

/**
 * UsageSummary — Current Usage Display
 * ===================================
 *
 * Design: Clean progress bars showing usage vs limits with colour coding
 * - Green  (< 60%)  — healthy
 * - Amber  (60–89%) — approaching limit
 * - Red    (≥ 90%)  — critical / at limit
 */

interface FeatureUsage {
  used: number;
  limit: number | null;
  is_unlimited: boolean;
}

interface UsageSummaryProps {
  currentPlan: {
    display_name: string;
    plan_slug: string;
  };
  /** Shape: { feature_key: { used, limit, is_unlimited } } */
  usage: Record<string, FeatureUsage | number>;
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function barColor(pct: number): string {
  if (pct >= 90) return '#ef4444'; // red
  if (pct >= 60) return '#f59e0b'; // amber
  return '#22c55e';                // green
}

export default function UsageSummary({ currentPlan, usage }: UsageSummaryProps) {
  if (!usage || Object.keys(usage).length === 0) return null;

  return (
    <div className="rounded-lg border-2 border-gray-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-black mb-4">
        Current Usage on {currentPlan.display_name}
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(usage).map(([feature, raw]) => {
          // Support both the new enriched shape and the legacy plain-number shape
          const enriched = typeof raw === 'object' && raw !== null ? raw as FeatureUsage : null;
          const used       = enriched ? enriched.used       : (raw as number);
          const limit      = enriched ? enriched.limit      : null;
          const unlimited  = enriched ? enriched.is_unlimited : false;

          const pct = unlimited || limit === null || limit === 0
            ? 0
            : Math.min(100, Math.round((used / limit) * 100));

          return (
            <div key={feature} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">{formatLabel(feature)}</span>
                <span className="font-medium text-black">
                  {used}
                  {unlimited ? ' / ∞' : limit !== null ? ` / ${limit}` : ''}
                </span>
              </div>

              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: unlimited ? '0%' : `${pct}%`,
                    backgroundColor: unlimited ? '#22c55e' : barColor(pct),
                  }}
                />
              </div>

              {!unlimited && limit !== null && (
                <p className="text-xs text-gray-400">
                  {pct >= 90
                    ? 'At limit — consider upgrading'
                    : pct >= 60
                      ? `${limit - used} remaining`
                      : `${limit - used} remaining`}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
