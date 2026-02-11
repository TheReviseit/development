/**
 * Next.js 16 Proxy - Enterprise Multi-Domain Router
 *
 * Architecture:
 * - Production: Domain-based routing (shop.flowauxi.com → /shop)
 * - Development: Port-based routing (localhost:3001 → /shop)
 * - Explicit segments (NOT route groups) for deterministic routing
 * - Preserves all existing auth middleware logic
 *
 * Products:
 * - shop.flowauxi.com (port 3001) → /shop
 * - marketing.flowauxi.com (port 3002) → /marketing
 * - showcase.flowauxi.com (port 3003) → /showcase
 * - flowauxi.com (port 3000) → /dashboard-home (main product)
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  evaluateDomainAccess,
  applyDecision,
  type ProductContext,
} from "@/lib/domain-policy";
import { resolveDomain, getLandingRoute } from "@/lib/domain/config";

// =============================================================================
// TYPES
// =============================================================================

type UserType = "normal" | "console" | null;

// Domain resolution now delegated to lib/domain/config.ts (single source of truth)
// DOMAIN_TO_LANDING and PORT_TO_LANDING maps removed — use resolveDomain() + getLandingRoute()

// =============================================================================
// AUTH ROUTE POLICY (Declarative - Which routes require which auth)
// =============================================================================

const AUTH_ROUTE_POLICY: Record<string, "normal" | "console"> = {
  "/dashboard": "normal",
  "/console": "console",
  "/settings": "normal",
  "/onboarding": "normal",
};

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/console/login",
  "/console/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/data-handling-policy",
  "/apis",
  "/store",
  "/payment-success",
  "/error",
  "/offline",
  "/docs",
  "/booking",
  "/showcase",
  "/onboarding-embedded",
  "/manifest.webmanifest",
  "/sw.js",
  "/sitemap.xml",
  "/robots.txt",
  "/pricing",
  // Product landing pages
  "/shop",
  "/marketing",
];

const PUBLIC_API_ROUTES = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/create-user",
  "/api/auth/check-user-exists",
  "/api/auth/send-verification",
  "/api/webhooks",
  "/api/facebook/deauthorize",
  "/api/facebook/data-deletion",
  "/api/ai-appointment-book",
  "/api/store",
  "/api/orders/track",
  "/api/console",
  "/api/v1",
  "/api/whatsapp",
  "/api/booking",
  "/api/showcase",
];

// =============================================================================
// AUTH HELPERS
// =============================================================================

function getUserTypeFromCookies(request: NextRequest): UserType {
  const hasNormalSession =
    request.cookies.has("session") || request.cookies.has("flowauxi_session");
  const hasConsoleSession =
    request.cookies.has("otp_console_session") ||
    request.cookies.has("flowauxi_console_session");

  if (hasNormalSession && hasConsoleSession) {
    return null;
  }

  if (hasConsoleSession) return "console";
  if (hasNormalSession) return "normal";
  return null;
}

function getRequiredUserType(pathname: string): "normal" | "console" | null {
  for (const [routePrefix, userType] of Object.entries(AUTH_ROUTE_POLICY)) {
    if (pathname.startsWith(routePrefix)) {
      return userType;
    }
  }
  return null;
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route));
}

function redirectToError(
  request: NextRequest,
  code: string,
  expected: string,
  current: string,
): NextResponse {
  const url = new URL(`/error`, request.url);
  url.searchParams.set("code", code);
  url.searchParams.set("expected", expected);
  url.searchParams.set("current", current);
  return NextResponse.redirect(url);
}

function redirectToLogin(
  request: NextRequest,
  userType: "normal" | "console",
  next?: string,
): NextResponse {
  const loginPath = userType === "console" ? "/console/login" : "/login";
  const url = new URL(loginPath, request.url);
  if (next) {
    url.searchParams.set("next", next);
  }
  return NextResponse.redirect(url);
}

function redirectToDashboard(
  request: NextRequest,
  userType: "normal" | "console",
): NextResponse {
  const dashboardPath = userType === "console" ? "/console" : "/dashboard";
  return NextResponse.redirect(new URL(dashboardPath, request.url));
}

// =============================================================================
// USERNAME 301 REDIRECT HELPERS (SEO-Critical)
// =============================================================================

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
const UUID_PATTERN = /^[a-zA-Z0-9-]{20,}$/;

async function getUsernameByUserId(userId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/username/resolve/${userId}`,
      {
        headers: {
          "Cache-Control": "max-age=300",
        },
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.username || null;
  } catch (error) {
    console.error("Failed to resolve username:", error);
    return null;
  }
}

// =============================================================================
// PROXY FUNCTION (Next.js 16 required signature)
// =============================================================================

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hostname = request.nextUrl.hostname;
  const port = request.nextUrl.port;

  // Only match actual API endpoints (/api/...), NOT /apis (which is a page)
  const isApiPath = pathname.startsWith("/api/") || pathname === "/api";

  // ==========================================================================
  // STEP 0: Username-based 301 redirects (SEO-Critical)
  // ==========================================================================
  const storeMatch = pathname.match(/^\/store\/([^\/]+)/);
  const showcaseMatch = pathname.match(/^\/showcase\/([^\/]+)/);

  if (storeMatch || showcaseMatch) {
    const identifier = storeMatch?.[1] || showcaseMatch?.[1];
    const routeType = storeMatch ? "store" : "showcase";

    if (identifier && UUID_PATTERN.test(identifier)) {
      console.log(`🔍 Detected old UID URL: /${routeType}/${identifier}`);

      const username = await getUsernameByUserId(identifier);

      if (username) {
        const newPath = pathname.replace(identifier, username);
        const newUrl = new URL(newPath, request.url);
        newUrl.search = request.nextUrl.search;

        console.log(`✅ 301 Redirect: ${pathname} → ${newPath}`);
        return NextResponse.redirect(newUrl, 301);
      }
    }
  }

  // ==========================================================================
  // STEP 1: Multi-Domain Product Landing Pages (Enterprise Feature)
  // ==========================================================================
  // CRITICAL: Only rewrite root "/" path, not nested routes
  // Example: shop.flowauxi.com/ → /shop (rewrite)
  //          shop.flowauxi.com/products → no rewrite (let it route normally)

  if (pathname === "/") {
    const domain = resolveDomain(hostname, port);
    const targetLanding = getLandingRoute(domain);

    // Perform rewrite to explicit segment (e.g., /shop, /marketing)
    if (targetLanding && targetLanding !== "/") {
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = targetLanding;

      const response = NextResponse.rewrite(rewriteUrl);
      // Set product domain header (single source of truth)
      response.headers.set("x-product-domain", domain);
      response.headers.set("x-landing-page", targetLanding);
      // CDN cache headers for landing pages (enterprise-grade performance)
      response.headers.set(
        "Cache-Control",
        "public, s-maxage=3600, stale-while-revalidate=86400",
      );
      return response;
    }
  }

  // ==========================================================================
  // STEP 2: Domain-aware routing (delegated to domain-policy.ts)
  // ==========================================================================
  const domainDecision = evaluateDomainAccess(request);

  // Handle domain-level REWRITES (e.g., api.flowauxi.com/ → shows /apis content)
  if (domainDecision.rewrite) {
    return applyDecision(domainDecision, request);
  }

  // Handle domain-level REDIRECTS (e.g., /login on API domain → /console/login)
  if (!domainDecision.allowed && domainDecision.redirect) {
    return applyDecision(domainDecision, request);
  }

  // ==========================================================================
  // STEP 3: API Routes - Let them handle their own auth
  // ==========================================================================
  if (isApiPath) {
    if (isPublicApiRoute(pathname)) {
      return addProductHeaders(
        NextResponse.next(),
        domainDecision.product,
        domainDecision.seo.canonical,
      );
    }
    const userType = getUserTypeFromCookies(request);
    if (!userType && !pathname.startsWith("/api/console")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return addProductHeaders(
      NextResponse.next(),
      domainDecision.product,
      domainDecision.seo.canonical,
    );
  }

  // ==========================================================================
  // STEP 4: Auth checks for page routes
  // ==========================================================================
  const userType = getUserTypeFromCookies(request);
  const requiredType = getRequiredUserType(pathname);
  const isPublic = isPublicRoute(pathname);

  // Case 1: Public routes - allow all
  if (isPublic) {
    // Redirect logged-in users away from login pages
    if (pathname === "/login" && userType === "normal") {
      return redirectToDashboard(request, "normal");
    }
    if (pathname === "/console/login" && userType === "console") {
      return redirectToDashboard(request, "console");
    }
    // Cross-auth on login pages: redirect to correct dashboard
    if (pathname === "/login" && userType === "console") {
      return redirectToDashboard(request, "console");
    }
    if (pathname === "/console/login" && userType === "normal") {
      return redirectToDashboard(request, "normal");
    }

    return addProductHeaders(
      NextResponse.next(),
      domainDecision.product,
      domainDecision.seo.canonical,
    );
  }

  // Case 2: Protected route, no auth
  if (requiredType && !userType) {
    return redirectToLogin(request, requiredType, pathname);
  }

  // Case 3: Protected route, wrong user type (CROSS-AUTH)
  if (requiredType && userType && userType !== requiredType) {
    return redirectToError(request, "WRONG_PORTAL", requiredType, userType);
  }

  // Case 4: Protected route, correct user type - allow
  return addProductHeaders(
    NextResponse.next(),
    domainDecision.product,
    domainDecision.seo.canonical,
  );
}

// =============================================================================
// HELPER: Add product context headers
// =============================================================================

function addProductHeaders(
  response: NextResponse,
  product: ProductContext,
  canonical: string,
): NextResponse {
  response.headers.set("x-product-context", product);
  response.headers.set("x-product-domain", product);
  response.headers.set("x-canonical-url", canonical);
  return response;
}

// =============================================================================
// CONFIG
// =============================================================================

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - Static files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|gif|png|svg|ico|css|js|webp|woff|woff2|webmanifest|json|xml|txt)).*)",
  ],
};

// Default export for Next.js 16 compatibility
export default proxy;
