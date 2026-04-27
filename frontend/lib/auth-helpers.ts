/**
 * Enterprise Auth Helper Functions
 * Standard: Google Workspace / Zoho One Level
 * Purpose: Domain detection, product validation, session management
 *
 * ARCHITECTURE: Domain resolution delegates to canonical resolveDomain()
 * from lib/domain/config.ts. Product eligibility derives from PRODUCT_REGISTRY.
 * No hardcoded allow-lists or domain maps — adding a product requires
 * editing ONLY PRODUCT_REGISTRY + domain/config.ts.
 */

import { NextRequest } from "next/server";
import { ProductDomain, isValidProductDomain } from "@/types/auth.types";
import { PRODUCT_REGISTRY } from "@/lib/product/registry";
import { resolveDomain } from "@/lib/domain/config";

/**
 * Detect the current product domain from the request.
 *
 * Delegates hostname/port resolution to the canonical resolveDomain()
 * from lib/domain/config.ts, preserving ONLY the request-specific
 * override mechanisms (X-Product-Context header, ?product= query param,
 * pathname fallback) that have no equivalent in the canonical resolver.
 */
export function detectProductFromRequest(request: NextRequest): ProductDomain {
  // Priority 1: Explicit header override (set by middleware or dev tools)
  const productHeader = request.headers.get("x-product-context");
  if (productHeader && isValidProductDomain(productHeader)) {
    return productHeader as ProductDomain;
  }

  // Priority 2: Canonical domain resolution (single source of truth)
  const hostname = request.headers.get("host") || "";
  const port = hostname.split(":")[1] || undefined;
  const resolvedDomain = resolveDomain(hostname, port);

  // In production, resolveDomain is sufficient — return it directly.
  if (process.env.NODE_ENV === "production") {
    return resolvedDomain;
  }

  // In development, allow query param and pathname overrides
  // for local testing convenience (these are dev-only, not production paths)
  const searchParams = request.nextUrl.searchParams;
  const productParam = searchParams.get("product");
  if (productParam && isValidProductDomain(productParam)) {
    return productParam as ProductDomain;
  }

  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/dashboard/products") || pathname.startsWith("/dashboard/orders")) {
    return "shop";
  }
  if (pathname.startsWith("/dashboard/showcase") || pathname.startsWith("/dashboard/pages")) {
    return "showcase";
  }
  if (pathname.startsWith("/dashboard/campaigns") || pathname.startsWith("/dashboard/marketing")) {
    return "marketing";
  }
  if (pathname.startsWith("/dashboard/appointments") || pathname.startsWith("/dashboard/services")) {
    return "booking";
  }

  return resolvedDomain;
}

/**
 * Get the canonical domain URL for a product.
 * Derives hostname and port from PRODUCT_REGISTRY — no hardcoded maps.
 */
export function getProductDomainURL(product: ProductDomain): string {
  const config = PRODUCT_REGISTRY[product];
  if (!config) return process.env.NEXT_PUBLIC_BASE_URL || "https://flowauxi.com";

  if (process.env.NODE_ENV === "production") {
    return `https://${config.domain}`;
  }

  // Development: use devPort from registry
  const port = config.devPort ?? 3000;
  return `http://localhost:${port}`;
}

/**
 * Extract request context for audit logging
 */
export function getRequestContext(request: NextRequest) {
  let rawIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    (request as any).ip ||
    null;

  if (rawIp) {
    if (rawIp.startsWith("[")) {
      rawIp = rawIp.split("]")[0].substring(1); // extract from [::1]:3005
    } else if (rawIp.includes(":") && rawIp.split(":").length === 2) {
      rawIp = rawIp.split(":")[0]; // extract from 127.0.0.1:3005
    }
  }

  return {
    ip_address: rawIp,
    user_agent: request.headers.get("user-agent") || null,
    request_id: request.headers.get("x-request-id") || crypto.randomUUID(),
    traceparent: request.headers.get("traceparent") || null,
  };
}

/**
 * Validate that a product is available for self-service activation.
 *
 * Derives eligibility from PRODUCT_REGISTRY — adding a product with
 * pricing tiers automatically makes it self-service. No hardcoded lists.
 *
 * Products without pricing (e.g. future enterprise-only products)
 * are excluded by design: isProductAvailableForActivation() returns false.
 *
 * Dashboard and API are special cases:
 *   - Dashboard: auto-granted, never needs "activation"
 *   - API: requires admin approval, not self-service
 */
export function isProductAvailableForActivation(
  product: ProductDomain,
): boolean {
  if (product === "dashboard") return false;
  if (product === "api") return false;

  const config = PRODUCT_REGISTRY[product];
  if (!config) return false;

  return config.pricing.length > 0;
}

/**
 * Get all self-service product domains (derived from registry).
 * Used for PRODUCT_NOT_ENABLED responses and activation UIs.
 * Never goes stale when new products are added to PRODUCT_REGISTRY.
 */
export function getSelfServiceProducts(): ProductDomain[] {
  return (Object.keys(PRODUCT_REGISTRY) as ProductDomain[]).filter(
    (p) => isProductAvailableForActivation(p),
  );
}

/**
 * Get the default (starter) plan slug for a product.
 * Returns the product-scoped planId (e.g., "booking_starter") or
 * "starter" as fallback for unknown products.
 *
 * This ensures the trial system creates memberships with the correct
 * product-scoped plan identifier, not a generic "starter" string that
 * may not match the backend's plan registry.
 */
export function getStarterPlanSlug(product: ProductDomain): string {
  const config = PRODUCT_REGISTRY[product];
  if (!config) return "starter";
  const starterTier = config.pricing.find((t) => t.id === "starter");
  return starterTier?.planId ?? "starter";
}

/**
 * Calculate trial end date
 */
export function calculateTrialEndDate(trialDays: number = 14): Date {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + trialDays);
  return endDate;
}

/**
 * Check if a trial has expired
 */
export function isTrialExpired(trialEndsAt: string | null): boolean {
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt) < new Date();
}