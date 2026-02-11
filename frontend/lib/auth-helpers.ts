/**
 * Enterprise Auth Helper Functions
 * Standard: Google Workspace / Zoho One Level
 * Purpose: Domain detection, product validation, session management
 */

import { NextRequest } from "next/server";
import { ProductDomain, isValidProductDomain } from "@/types/auth.types";

/**
 * Detect the current product domain from the request
 *
 * Priority (Production):
 * 1. Subdomain (shop.flowauxi.com → 'shop')
 * 2. Header X-Product-Context (set by middleware)
 * 3. Default: 'dashboard'
 *
 * Priority (Development):
 * 1. Port (3001 → 'shop', 3002 → 'showcase', etc.)
 * 2. Query param ?product=shop
 * 3. Header X-Product-Context
 * 4. Pathname-based (/dashboard/products → 'shop')
 * 5. Default: 'dashboard'
 */
export function detectProductFromRequest(request: NextRequest): ProductDomain {
  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;
  const searchParams = request.nextUrl.searchParams;

  // Check X-Product-Context header (set by middleware or dev tools)
  const productHeader = request.headers.get("x-product-context");
  if (productHeader && isValidProductDomain(productHeader)) {
    return productHeader as ProductDomain;
  }

  // Production: Subdomain detection
  if (process.env.NODE_ENV === "production") {
    if (hostname.startsWith("shop.")) return "shop";
    if (hostname.startsWith("pages.")) return "showcase";
    if (hostname.startsWith("marketing.")) return "marketing";
    if (hostname.startsWith("api.")) return "api";
  }

  // Development: Port-based detection
  if (process.env.NODE_ENV === "development") {
    const port = hostname.split(":")[1];
    if (port === "3001") return "shop";
    if (port === "3002") return "showcase";
    if (port === "3003") return "marketing";
    if (port === "3004") return "api";

    // Query param override
    const productParam = searchParams.get("product");
    if (productParam && isValidProductDomain(productParam)) {
      return productParam as ProductDomain;
    }

    // Pathname-based detection (for development convenience)
    if (
      pathname.startsWith("/dashboard/products") ||
      pathname.startsWith("/dashboard/orders")
    ) {
      return "shop";
    }
    if (
      pathname.startsWith("/dashboard/showcase") ||
      pathname.startsWith("/dashboard/pages")
    ) {
      return "showcase";
    }
    if (
      pathname.startsWith("/dashboard/campaigns") ||
      pathname.startsWith("/dashboard/marketing")
    ) {
      return "marketing";
    }
  }

  // Default: dashboard (always accessible)
  return "dashboard";
}

/**
 * Get the canonical domain URL for a product
 */
export function getProductDomainURL(product: ProductDomain): string {
  if (process.env.NODE_ENV === "production") {
    const baseURL = process.env.NEXT_PUBLIC_BASE_URL || "https://flowauxi.com";
    const subdomains: Record<ProductDomain, string> = {
      shop: "shop.flowauxi.com",
      showcase: "pages.flowauxi.com",
      marketing: "marketing.flowauxi.com",
      api: "api.flowauxi.com",
      dashboard: "flowauxi.com",
    };
    return `https://${subdomains[product]}`;
  } else {
    // Development: Use ports
    const ports: Record<ProductDomain, number> = {
      shop: 3001,
      showcase: 3002,
      marketing: 3003,
      api: 3004,
      dashboard: 3000,
    };
    return `http://localhost:${ports[product]}`;
  }
}

/**
 * Extract request context for audit logging
 */
export function getRequestContext(request: NextRequest) {
  return {
    ip_address:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      (request as any).ip ||
      null,
    user_agent: request.headers.get("user-agent") || null,
    request_id: request.headers.get("x-request-id") || crypto.randomUUID(),
  };
}

/**
 * Validate that a product is available for activation
 * (Future: Check if product is deprecated, enterprise-only, etc.)
 */
export function isProductAvailableForActivation(
  product: ProductDomain,
): boolean {
  // Dashboard is always available but cannot be "activated" (auto-granted)
  if (product === "dashboard") return false;

  // API product is not self-service (requires admin approval)
  if (product === "api") return false;

  // Shop, showcase, marketing are self-service
  return ["shop", "showcase", "marketing"].includes(product);
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
