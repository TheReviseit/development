'use client';

/**
 * BillingCycleToggle — Monthly/Yearly Switcher with Savings Badge
 * ==============================================================
 *
 * Design: Clean toggle with black buttons, white background
 * Features: Savings percentage badge, smooth transitions
 */

interface BillingCycleToggleProps {
  value: 'monthly' | 'yearly';
  onChange: (cycle: 'monthly' | 'yearly') => void;
  savingsPercent: number;
}

export default function BillingCycleToggle({
  value,
  onChange,
  savingsPercent,
}: BillingCycleToggleProps) {
  return (
    <div className="inline-flex flex-col items-center space-y-2">
      {/* Toggle Buttons */}
      <div className="inline-flex rounded-lg border-2 border-black p-1 bg-white">
        <button
          onClick={() => onChange('monthly')}
          className={`
            px-6 py-2 rounded-md text-sm font-medium transition-all duration-200
            ${
              value === 'monthly'
                ? 'bg-black text-white shadow-sm'
                : 'bg-white text-black hover:bg-gray-50'
            }
          `}
        >
          Monthly
        </button>
        <button
          onClick={() => onChange('yearly')}
          className={`
            relative px-6 py-2 rounded-md text-sm font-medium transition-all duration-200
            ${
              value === 'yearly'
                ? 'bg-black text-white shadow-sm'
                : 'bg-white text-black hover:bg-gray-50'
            }
          `}
        >
          Yearly
          {/* Savings Badge */}
          {savingsPercent > 0 && (
            <span
              className={`
                absolute -top-2 -right-2 px-2 py-0.5 text-xs font-bold rounded-full
                ${
                  value === 'yearly'
                    ? 'bg-white text-black'
                    : 'bg-black text-white'
                }
              `}
            >
              Save {savingsPercent}%
            </span>
          )}
        </button>
      </div>

      {/* Helper Text */}
      {value === 'yearly' && savingsPercent > 0 && (
        <p className="text-sm text-gray-600 animate-fade-in">
          Save {savingsPercent}% with annual billing
        </p>
      )}
    </div>
  );
}
