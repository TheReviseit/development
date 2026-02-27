'use client';

/**
 * FeatureDifferenceModal — Feature Changes Display
 * ==============================================
 *
 * Design: Modal overlay with black/white theme showing gained/lost features
 */

import { useEffect } from 'react';

interface FeatureDifferences {
  gained?: string[];
  lost?: string[];
  limit_changes?: Record<string, { from: number; to: number }>;
}

interface FeatureDifferenceModalProps {
  planName: string;
  differences: FeatureDifferences;
  onClose: () => void;
}

export default function FeatureDifferenceModal({
  planName,
  differences,
  onClose,
}: FeatureDifferenceModalProps) {
  // Close on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-black">
            Upgrading to {planName}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-black transition-colors"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {/* Gained Features */}
          {differences.gained && differences.gained.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-black mb-3 flex items-center">
                <svg
                  className="h-5 w-5 text-green-600 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
                New Features
              </h4>
              <ul className="space-y-2">
                {differences.gained.map((feature) => (
                  <li key={feature} className="flex items-start text-sm">
                    <svg
                      className="h-5 w-5 text-green-600 mr-2 mt-0.5 flex-shrink-0"
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
                    <span className="text-gray-700 capitalize">
                      {feature.replace(/_/g, ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Limit Changes */}
          {differences.limit_changes && Object.keys(differences.limit_changes).length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-black mb-3 flex items-center">
                <svg
                  className="h-5 w-5 text-blue-600 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
                Increased Limits
              </h4>
              <ul className="space-y-2">
                {Object.entries(differences.limit_changes).map(([feature, change]) => (
                  <li key={feature} className="flex items-start text-sm">
                    <span className="text-gray-700 capitalize">
                      {feature.replace(/_/g, ' ')}:
                    </span>
                    <span className="ml-2 font-medium text-black">
                      {change.from} → {change.to}
                    </span>
                    <span className="ml-2 text-green-600 font-medium">
                      (+{change.to - change.from})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Lost Features (downgrades) */}
          {differences.lost && differences.lost.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-black mb-3 flex items-center">
                <svg
                  className="h-5 w-5 text-red-600 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 12H4"
                  />
                </svg>
                Removed Features
              </h4>
              <ul className="space-y-2">
                {differences.lost.map((feature) => (
                  <li key={feature} className="flex items-start text-sm">
                    <svg
                      className="h-5 w-5 text-red-600 mr-2 mt-0.5 flex-shrink-0"
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
                    <span className="text-gray-700 capitalize">
                      {feature.replace(/_/g, ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-black text-white font-medium hover:bg-gray-800 transition-colors duration-200"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
