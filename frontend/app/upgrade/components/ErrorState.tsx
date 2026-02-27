'use client';

/**
 * ErrorState — Error Display with Retry
 * ====================================
 *
 * Design: Clean error message with black retry button
 */

interface ErrorStateProps {
  error: Error;
  onRetry: () => void;
}

export default function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <div className="text-center py-12">
      <div className="mx-auto max-w-md">
        {/* Error Icon */}
        <svg
          className="mx-auto h-16 w-16 text-gray-400"
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

        {/* Error Message */}
        <h3 className="mt-4 text-lg font-semibold text-black">
          Failed to Load Upgrade Options
        </h3>
        <p className="mt-2 text-sm text-gray-600">
          {error.message || 'An unexpected error occurred'}
        </p>

        {/* Retry Button */}
        <button
          onClick={onRetry}
          className="mt-6 px-6 py-2 bg-black text-white font-medium hover:bg-gray-800 transition-colors duration-200"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
