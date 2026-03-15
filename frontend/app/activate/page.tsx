"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthProvider, useAuth } from "@/app/components/auth/AuthProvider";
import { ProductDomain, getProductDisplayName } from "@/types/auth.types";

/**
 * Product Activation Page
 *
 * Paid products (marketing, shop, showcase) redirect straight to
 * the onboarding payment flow — there is NO free tier.
 *
 * Only API/dashboard (if they ever land here) get the activate UI,
 * and even that goes through the payment flow.
 */

const PAID_DOMAINS: ProductDomain[] = ["marketing", "shop", "showcase"];

function ActivatePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    authState,
    currentProduct,
    activateProduct,
  } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productToActivate = (searchParams.get("product") ||
    currentProduct) as ProductDomain;

  // Paid products: skip this page entirely → go to payment onboarding
  useEffect(() => {
    if (productToActivate && PAID_DOMAINS.includes(productToActivate)) {
      window.location.href = `/onboarding-embedded?domain=${productToActivate}`;
    }
  }, [productToActivate]);

  // If paid domain, show brief loading while redirect fires
  if (productToActivate && PAID_DOMAINS.includes(productToActivate)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-gray-600">Redirecting to payment...</p>
        </div>
      </div>
    );
  }

  if (!productToActivate || productToActivate === "dashboard") {
    router.push("/dashboard");
    return null;
  }

  const productDisplayName = getProductDisplayName(productToActivate);

  const handleActivate = async () => {
    if (!productToActivate) return;

    setLoading(true);
    setError(null);

    try {
      const success = await activateProduct(productToActivate);

      if (success) {
        const productUrls: Record<ProductDomain, string> = {
          shop: "/dashboard/products",
          showcase: "/dashboard/showcase",
          marketing: "/dashboard/campaigns",
          dashboard: "/dashboard",
          api: "/dashboard/api",
        };

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

  useEffect(() => {
    if (authState === "AUTHENTICATED") {
      router.push("/dashboard");
    }
  }, [authState, router]);

  if (
    authState === "INITIALIZING" ||
    authState === "VERIFYING_SESSION" ||
    authState === "SYNCING_TO_DB"
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (authState === "UNAUTHENTICATED" || authState === "SESSION_ONLY") {
    router.push(`/login?redirect=/activate?product=${productToActivate}`);
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white shadow-xl rounded-2xl overflow-hidden">
        <div className="bg-gray-900 px-8 py-6 text-white">
          <h1 className="text-2xl font-bold">Activate {productDisplayName}</h1>
          <p className="text-gray-300 mt-1">Set up your account to get started</p>
        </div>

        <div className="p-8">
          <p className="text-gray-700 mb-6">
            You need to activate{" "}
            <strong className="text-gray-900">{productDisplayName}</strong> to
            access this feature.
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleActivate}
            disabled={loading}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
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
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Activating...
              </>
            ) : (
              "Activate Now"
            )}
          </button>

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full mt-4 text-gray-600 hover:text-gray-900 font-medium py-2 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <AuthProvider>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4" />
              <p className="text-gray-600">Loading...</p>
            </div>
          </div>
        }
      >
        <ActivatePageContent />
      </Suspense>
    </AuthProvider>
  );
}
