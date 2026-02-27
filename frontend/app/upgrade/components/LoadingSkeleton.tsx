'use client';

/**
 * LoadingSkeleton — Beautiful Loading State
 * ========================================
 *
 * Design: Pulse animation with clean white/gray skeleton
 */

export default function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Billing Toggle Skeleton */}
      <div className="flex justify-center">
        <div className="h-12 w-64 bg-gray-200 rounded-lg" />
      </div>

      {/* Plan Cards Skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="border-2 border-gray-200 rounded-lg p-6 bg-white">
            {/* Title */}
            <div className="h-6 bg-gray-200 rounded w-3/4" />
            {/* Tagline */}
            <div className="mt-2 h-4 bg-gray-100 rounded w-1/2" />

            {/* Price */}
            <div className="mt-6 h-10 bg-gray-200 rounded w-2/3" />

            {/* Button */}
            <div className="mt-6 h-12 bg-gray-200 rounded" />

            {/* Features */}
            <div className="mt-6 space-y-3">
              {[1, 2, 3, 4].map((j) => (
                <div key={j} className="flex items-center">
                  <div className="h-5 w-5 bg-gray-200 rounded mr-2" />
                  <div className="h-4 bg-gray-100 rounded flex-1" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
