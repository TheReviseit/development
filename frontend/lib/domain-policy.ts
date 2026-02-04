/**
 * Domain Policy - Decision Logic for Multi-Product Routing
 *
 * Extracted from proxy.ts for:
 * - Easier testing
 * - Easier future products (status.flowauxi.com, etc.)
 * - Less risk when modifying routes
 *
 * Products:
 * - api.flowauxi.com → OTP API Platform
 * - flowauxi.com → WhatsApp Dashboard
 */

import { NextRequest, NextResponse } from "next/server";

// =============================================================================
// TYPES
// =============================================================================

export type ProductContext = "api" | "dashboard";

export interface DomainConfig {
  product: ProductContext;
  allowedRoutes: string[];
  blockedRoutes: string[];
  defaultHome: string;
  loginPath: string;
  seoBase: string;
}

export interface DomainDecision {
  product: ProductContext;
  allowed: boolean;
  redirect?: string;
  seo: {
    canonical: string;
    index: boolean;
  };
}

// =============================================================================
// DOMAIN CONFIGURATION (Single Source of Truth)
// =============================================================================

export const DOMAIN_CONFIG: Record<string, DomainConfig> = {
  "api.flowauxi.com": {
    product: "api",
    allowedRoutes: ["/apis", "/console", "/docs", "/pricing"],
    blockedRoutes: [
      "/dashboard",
      "/onboarding",
      "/settings",
      "/whatsapp-admin",
    ],
    defaultHome: "/apis",
    loginPath: "/console/login",
    seoBase: "https://api.flowauxi.com",
  },
  "flowauxi.com": {
    product: "dashboard",
    allowedRoutes: [
      "/",
      "/dashboard",
      "/login",
      "/signup",
      "/onboarding",
      "/settings",
      "/store",
      "/payment",
      "/privacy",
      "/terms",
    ],
    blockedRoutes: ["/console", "/docs"],
    defaultHome: "/",
    loginPath: "/login",
    seoBase: "https://flowauxi.com",
  },
};

// Shared public routes (work on both domains)
const SHARED_PUBLIC_ROUTES = [
  "/error",
  "/offline",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/data-handling-policy",
  "/verify-email",
  "/reset-password",
  "/forgot-password",
];

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if hostname is development or preview environment.
 */
export function isDevOrPreview(hostname: string): boolean {
  return (
    hostname.includes("localhost") ||
    hostname.includes("127.0.0.1") ||
    hostname.includes(".vercel.app") ||
    hostname.includes(".vercel.sh")
  );
}

/**
 * Get product context from hostname.
 * In dev/preview, defaults to dashboard unless ?product=api is set.
 */
export function getProductFromDomain(
  hostname: string,
  searchParams?: URLSearchParams,
): ProductContext {
  // Production domains
  if (hostname === "api.flowauxi.com") return "api";
  if (hostname === "flowauxi.com" || hostname === "www.flowauxi.com")
    return "dashboard";

  // Dev/Preview: check URL param override
  if (isDevOrPreview(hostname)) {
    if (searchParams?.get("product") === "api") return "api";
    return "dashboard"; // Default to dashboard in dev
  }

  // Unknown domain: default to dashboard
  return "dashboard";
}

/**
 * Get domain configuration for a product.
 */
export function getDomainConfig(product: ProductContext): DomainConfig {
  return product === "api"
    ? DOMAIN_CONFIG["api.flowauxi.com"]
    : DOMAIN_CONFIG["flowauxi.com"];
}

/**
 * Check if route is allowed for the current product.
 */
function isRouteAllowed(pathname: string, config: DomainConfig): boolean {
  // Check if explicitly blocked
  for (const blocked of config.blockedRoutes) {
    if (pathname === blocked || pathname.startsWith(`${blocked}/`)) {
      return false;
    }
  }

  // Shared public routes always allowed
  for (const shared of SHARED_PUBLIC_ROUTES) {
    if (pathname === shared || pathname.startsWith(`${shared}/`)) {
      return true;
    }
  }

  // Check if explicitly allowed
  for (const allowed of config.allowedRoutes) {
    if (pathname === allowed || pathname.startsWith(`${allowed}/`)) {
      return true;
    }
  }

  // Default: allow (for static files, API routes, etc.)
  return true;
}

/**
 * Get redirect URL for blocked routes.
 */
function getRedirectForBlockedRoute(
  pathname: string,
  currentProduct: ProductContext,
): string | null {
  const otherProduct = currentProduct === "api" ? "dashboard" : "api";
  const otherConfig = getDomainConfig(otherProduct);

  // Check if route belongs to other product
  for (const allowed of otherConfig.allowedRoutes) {
    if (pathname === allowed || pathname.startsWith(`${allowed}/`)) {
      return `${otherConfig.seoBase}${pathname}`;
    }
  }

  return null;
}

// =============================================================================
// MAIN DECISION FUNCTION
// =============================================================================

/**
 * Evaluate domain access and return routing decision.
 * This is the core logic extracted from proxy.ts.
 */
export function evaluateDomainAccess(request: NextRequest): DomainDecision {
  const hostname = request.nextUrl.hostname;
  const pathname = request.nextUrl.pathname;
  const searchParams = request.nextUrl.searchParams;

  // Determine product context
  const product = getProductFromDomain(hostname, searchParams);
  const config = getDomainConfig(product);

  // Handle root path explicitly
  if (pathname === "/" && product === "api") {
    return {
      product,
      allowed: false,
      redirect: config.defaultHome,
      seo: {
        canonical: `${config.seoBase}${config.defaultHome}`,
        index: true,
      },
    };
  }

  // Check if route is allowed
  const allowed = isRouteAllowed(pathname, config);

  if (!allowed) {
    // Try to redirect to correct domain
    const crossDomainRedirect = getRedirectForBlockedRoute(pathname, product);

    return {
      product,
      allowed: false,
      redirect: crossDomainRedirect || config.defaultHome,
      seo: {
        canonical: crossDomainRedirect || `${config.seoBase}${pathname}`,
        index: false, // Don't index wrong-domain pages
      },
    };
  }

  // Route is allowed
  return {
    product,
    allowed: true,
    seo: {
      canonical: `${config.seoBase}${pathname}`,
      index: true,
    },
  };
}

// =============================================================================
// APPLY DECISION
// =============================================================================

/**
 * Apply routing decision by returning appropriate NextResponse.
 */
export function applyDecision(
  decision: DomainDecision,
  request: NextRequest,
): NextResponse {
  // If not allowed and has redirect, redirect
  if (!decision.allowed && decision.redirect) {
    // Check if it's a full URL (cross-domain) or path
    if (decision.redirect.startsWith("http")) {
      return NextResponse.redirect(decision.redirect);
    }
    return NextResponse.redirect(new URL(decision.redirect, request.url));
  }

  // If not allowed and no redirect, show error
  if (!decision.allowed) {
    return NextResponse.redirect(
      new URL("/error?code=ROUTE_NOT_FOUND", request.url),
    );
  }

  // Allowed: continue with product context header
  const response = NextResponse.next();

  // Add product context header for downstream use
  response.headers.set("x-product-context", decision.product);
  response.headers.set("x-canonical-url", decision.seo.canonical);

  return response;
}

// =============================================================================
// EXPORTS FOR COMPONENTS
// =============================================================================

/**
 * Get cross-domain URL for navigation.
 * Use this when linking between products.
 */
export function getCrossDomainUrl(
  targetProduct: ProductContext,
  path: string,
): string {
  const config = getDomainConfig(targetProduct);
  return `${config.seoBase}${path}`;
}

/**
 * Check if current URL is on correct domain for SEO.
 */
export function isCorrectDomain(hostname: string, pathname: string): boolean {
  const product = getProductFromDomain(hostname);
  const config = getDomainConfig(product);
  return isRouteAllowed(pathname, config);
}
