"use client";

import { useEffect, useState, useCallback } from "react";
import type { ProductDomain } from "@/lib/domain/config";
import ProductGatePopup from "./ProductGatePopup";

interface SubscriptionGateProps {
  /**
   * The product domain required to access this page.
   * e.g., "shop" for products/orders, "marketing" for campaigns
   */
  requiredProduct: ProductDomain;
  children: React.ReactNode;
}

interface DomainCheckResult {
  hasAccess: boolean;
  reason: string;
  membership: {
    status: string;
    product: string;
    trialEndsAt: string | null;
  } | null;
  subscription: {
    status: string;
    planSlug: string | null;
  } | null;
  domain: string;
}

/**
 * SubscriptionGate — Enterprise Product Access Guard
 *
 * Wraps dashboard pages that require a specific product subscription.
 * Checks server-side if user has access, blocks with premium popup if not.
 *
 * Usage:
 *   <SubscriptionGate requiredProduct="shop">
 *     <ProductsPage />
 *   </SubscriptionGate>
 */
export default function SubscriptionGate({
  requiredProduct,
  children,
}: SubscriptionGateProps) {
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [checkResult, setCheckResult] = useState<DomainCheckResult | null>(
    null,
  );

  const checkAccess = useCallback(async () => {
    // Dashboard is always free
    if (requiredProduct === "dashboard") {
      setHasAccess(true);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/subscription/check-domain?domain=${requiredProduct}`,
      );
      const data: DomainCheckResult = await res.json();

      setCheckResult(data);
      setHasAccess(data.hasAccess);
    } catch (error) {
      console.error("[SubscriptionGate] Error checking access:", error);
      // Fail open in case of network error — don't block users
      // due to transient issues. Backend still enforces limits.
      setHasAccess(true);
    } finally {
      setLoading(false);
    }
  }, [requiredProduct]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  // Listen for subscription updates (e.g., after activation)
  useEffect(() => {
    const handleSubscriptionUpdate = () => {
      setLoading(true);
      checkAccess();
    };

    window.addEventListener("subscription-updated", handleSubscriptionUpdate);
    window.addEventListener("product-activated", handleSubscriptionUpdate);

    return () => {
      window.removeEventListener(
        "subscription-updated",
        handleSubscriptionUpdate,
      );
      window.removeEventListener("product-activated", handleSubscriptionUpdate);
    };
  }, [checkAccess]);

  // Loading state — show nothing (page skeleton is still rendering under layout)
  if (loading) {
    return null;
  }

  // Access denied — show premium blocking popup
  if (!hasAccess) {
    return (
      <ProductGatePopup
        product={requiredProduct}
        onActivated={() => {
          setLoading(true);
          checkAccess();
        }}
      />
    );
  }

  // Access granted — render children
  return <>{children}</>;
}
