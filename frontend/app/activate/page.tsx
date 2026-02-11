"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/auth/AuthProvider";
import { ProductDomain, getProductDisplayName } from "@/types/auth.types";

/**
 * Product Activation Page
 * Enterprise self-service product activation UI
 * Standard: Google Workspace / Zoho One activation flow
 *
 * Triggered when:
 * - User logs into a subdomain without product membership
 * - AuthProvider returns PRODUCT_NOT_ENABLED state
 * - DashboardAuthGuard redirects to /activate?product=shop
 */

function ActivatePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    authState,
    currentProduct,
    availableProducts,
    activateProduct,
    user,
  } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get product from URL params or context
  const productToActivate = (searchParams.get("product") ||
    currentProduct) as ProductDomain;

  if (!productToActivate || productToActivate === "dashboard") {
    router.push("/dashboard");
    return null;
  }

  const productDisplayName = getProductDisplayName(productToActivate);

  /**
   * Handle product activation
   */
  const handleActivate = async () => {
    if (!productToActivate) return;

    setLoading(true);
    setError(null);

    try {
      const success = await activateProduct(productToActivate);

      if (success) {
        // Success! Redirect to product dashboard
        console.log(`✅ [ACTIVATE_UI] Product activated: ${productToActivate}`);

        // Determine redirect URL based on product
        const productUrls: Record<ProductDomain, string> = {
          shop: "/dashboard/products",
          showcase: "/dashboard/showcase",
          marketing: "/dashboard/campaigns",
          dashboard: "/dashboard",
          api: "/dashboard/api",
        };

        // Small delay to let session cookie propagate
        setTimeout(() => {
          router.push(productUrls[productToActivate] || "/dashboard");
        }, 500);
      } else {
        setError(
          "Failed to activate product. Please try again or contact support.",
        );
      }
    } catch (err: any) {
      console.error("[ACTIVATE_UI] Activation error:", err);
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Auto-redirect if already authenticated with product access
   */
  useEffect(() => {
    if (authState === "AUTHENTICATED") {
      console.log("[ACTIVATE_UI] Already authenticated, redirecting...");
      router.push("/dashboard");
    }
  }, [authState, router]);

  // Show loading while auth state is initializing
  if (
    authState === "INITIALIZING" ||
    authState === "VERIFYING_SESSION" ||
    authState === "SYNCING_TO_DB"
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Must be authenticated to activate products
  if (authState === "UNAUTHENTICATED" || authState === "SESSION_ONLY") {
    router.push(`/login?redirect=/activate?product=${productToActivate}`);
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-md w-full bg-white shadow-2xl rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6 text-white">
          <h1 className="text-3xl font-bold">Activate {productDisplayName}</h1>
          <p className="text-blue-100 mt-2">Start your 14-day free trial</p>
        </div>

        {/* Content */}
        <div className="p-8">
          <p className="text-gray-700 mb-6 text-lg">
            You need to activate{" "}
            <strong className="text-gray-900">{productDisplayName}</strong> to
            access this feature.
          </p>

          {/* Trial Benefits Card */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 mb-6">
            <h3 className="font-bold text-blue-900 mb-3 text-lg flex items-center">
              <svg
                className="w-6 h-6 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Free 14-Day Trial Includes:
            </h3>
            <ul className="space-y-2">
              <li className="flex items-start text-blue-900">
                <svg
                  className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-green-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Full access to all {productDisplayName} features</span>
              </li>
              <li className="flex items-start text-blue-900">
                <svg
                  className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-green-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>No credit card required</span>
              </li>
              <li className="flex items-start text-blue-900">
                <svg
                  className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-green-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Cancel anytime, no commitments</span>
              </li>
              <li className="flex items-start text-blue-900">
                <svg
                  className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0 text-green-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>24/7 support included</span>
              </li>
            </ul>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-6 flex items-start">
              <svg
                className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Activate Button */}
          <button
            onClick={handleActivate}
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-4 px-6 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-[1.02] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center text-lg"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Activating...
              </>
            ) : (
              <>
                <svg
                  className="w-6 h-6 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                Start 14-Day Free Trial
              </>
            )}
          </button>

          {/* Terms */}
          <p className="text-xs text-gray-500 text-center mt-4">
            By activating, you agree to our{" "}
            <a href="/terms" className="text-blue-600 hover:underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/privacy" className="text-blue-600 hover:underline">
              Privacy Policy
            </a>
            .
          </p>

          {/* Back to Dashboard Link */}
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full mt-6 text-gray-600 hover:text-gray-900 font-medium py-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center"
          >
            <svg
              className="w-5 h-5 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Dashboard
          </button>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-8 py-4 border-t border-gray-200">
          <div className="flex items-center justify-center text-sm text-gray-600">
            <svg
              className="w-4 h-4 mr-2 text-green-600"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>Secure checkout · SSL encrypted</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Activation Page (with Suspense boundary)
 */
export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      }
    >
      <ActivatePageContent />
    </Suspense>
  );
}
