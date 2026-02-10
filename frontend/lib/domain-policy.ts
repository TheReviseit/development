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

export type ProductContext =
  | "api"
  | "dashboard"
  | "shop"
  | "showcase"
  | "marketing";

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
  rewrite?: string; // Internal rewrite (shows different content at same URL)
  seo: {
    canonical: string;
    index: boolean;
  };
}

// =============================================================================
// DOMAIN CONFIGURATION (Single Source of Truth)
// =============================================================================

export const DOMAIN_CONFIG: Record<string, DomainConfig> = {
  "shop.flowauxi.com": {
    product: "shop",
    allowedRoutes: [
      "/dashboard",
      "/products",
      "/orders",
      "/messages",
      "/bot-settings", // AI Settings
      "/profile",
      "/settings",
      "/payment",
      "/payment-success",
    ],
    blockedRoutes: [
      "/showcase",
      "/campaigns",
      "/bulk-messages",
      "/templates",
      "/contacts",
      "/appointments",
      "/services",
      "/whatsapp-admin",
    ],
    defaultHome: "/dashboard",
    loginPath: "/login",
    seoBase: "https://shop.flowauxi.com",
  },
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
  "/booking", // Customer-facing booking pages
  "/showcase", // Public showcase pages
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

export function getProductFromDomain(
  hostname: string,
  searchParams?: URLSearchParams,
  pathname?: string,
): ProductContext {
  // Production domains - hostname determines product
  if (hostname === "shop.flowauxi.com") return "shop";
  if (hostname === "showcase.flowauxi.com") return "showcase";
  if (hostname === "marketing.flowauxi.com") return "marketing";
  if (hostname === "api.flowauxi.com") return "api";
  if (hostname === "flowauxi.com" || hostname === "www.flowauxi.com")
    return "dashboard";

  // Dev/Preview: Auto-detect from pathname (no manual URL param needed)
  if (isDevOrPreview(hostname) && pathname) {
    // Shop routes (check first - more specific)
    const shopRoutes = [
      "/dashboard",
      "/products",
      "/orders",
      "/messages",
      "/bot-settings",
    ];
    for (const route of shopRoutes) {
      if (pathname === route || pathname.startsWith(`${route}/`)) {
        return "shop";
      }
    }

    // API product routes
    const apiRoutes = ["/apis", "/console", "/docs"];
    for (const route of apiRoutes) {
      if (pathname === route || pathname.startsWith(`${route}/`)) {
        return "api";
      }
    }

    // Showcase routes
    if (pathname === "/showcase" || pathname.startsWith("/showcase/")) {
      return "showcase";
    }

    // Marketing routes
    const marketingRoutes = ["/campaigns", "/bulk-messages", "/templates"];
    for (const route of marketingRoutes) {
      if (pathname === route || pathname.startsWith(`${route}/`)) {
        return "marketing";
      }
    }

    // Allow URL param override for edge cases
    if (searchParams?.get("product") === "api") return "api";
    if (searchParams?.get("product") === "shop") return "shop";
    return "dashboard";
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

  // Determine product context (now uses pathname for dev detection)
  const product = getProductFromDomain(hostname, searchParams, pathname);
  const config = getDomainConfig(product);

  // ==========================================================================
  // API Domain: Root path shows /apis content (REWRITE, not redirect)
  // ==========================================================================
  if (pathname === "/" && product === "api") {
    return {
      product,
      allowed: true,
      rewrite: "/apis", // Show /apis content at root URL
      seo: {
        canonical: config.seoBase, // Canonical is just the root
        index: true,
      },
    };
  }

  // ==========================================================================
  // API Domain: /login redirects to /console/login
  // ==========================================================================
  if (pathname === "/login" && product === "api") {
    return {
      product,
      allowed: false,
      redirect: "/console/login",
      seo: {
        canonical: `${config.seoBase}/console/login`,
        index: false,
      },
    };
  }

  // ==========================================================================
  // API Domain: /signup redirects to /console/signup
  // ==========================================================================
  if (pathname === "/signup" && product === "api") {
    return {
      product,
      allowed: false,
      redirect: "/console/signup",
      seo: {
        canonical: `${config.seoBase}/console/signup`,
        index: false,
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
  // Handle REWRITE (show different content at same URL)
  if (decision.rewrite) {
    const rewriteUrl = new URL(decision.rewrite, request.url);
    const response = NextResponse.rewrite(rewriteUrl);
    response.headers.set("x-product-context", decision.product);
    response.headers.set("x-canonical-url", decision.seo.canonical);
    return response;
  }

  // Handle REDIRECT
  if (!decision.allowed && decision.redirect) {
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
