/**
 * Next.js Proxy - Enterprise Auth & Domain Gateway
 *
 * Server-side route protection with:
 * - Domain-aware multi-product routing
 * - Declarative policy-based auth
 * - Cross-auth detection and blocking
 * - Standardized error redirects
 * - Zero client-side flash
 *
 * Architecture:
 * - proxy.ts: Orchestrator only
 * - lib/domain-policy.ts: All domain decision logic
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  evaluateDomainAccess,
  applyDecision,
  getProductFromDomain,
  isDevOrPreview,
  type ProductContext,
} from "@/lib/domain-policy";

// =============================================================================
// TYPES
// =============================================================================

type UserType = "normal" | "console" | null;

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
  "/booking", // Customer-facing booking pages
  "/showcase", // Public showcase pages
  "/onboarding-embedded",
  "/manifest.webmanifest",
  "/sw.js",
  "/sitemap.xml",
  "/robots.txt",
  "/pricing",
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
  "/api/v1", // OTP API proxy routes
  "/api/whatsapp", // WhatsApp webhook and public endpoints
  "/api/booking", // Public booking page APIs
  "/api/showcase", // Public showcase page APIs
];

// =============================================================================
// AUTH HELPERS
// =============================================================================

function getUserTypeFromCookies(request: NextRequest): UserType {
  // Updated cookie names for shared domain strategy
  const hasNormalSession =
    request.cookies.has("session") || request.cookies.has("flowauxi_session");
  const hasConsoleSession =
    request.cookies.has("otp_console_session") ||
    request.cookies.has("flowauxi_console_session");

  if (hasNormalSession && hasConsoleSession) {
    return null; // Let route handler decide
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
const UUID_PATTERN = /^[a-zA-Z0-9-]{20,}$/; // Detect Firebase UIDs (20+ chars)

async function getUsernameByUserId(userId: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/username/resolve/${userId}`,
      {
        headers: {
          "Cache-Control": "max-age=300", // Cache for 5 minutes
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
// PROXY (Main export - Next.js 16+ auto-detects this)
// =============================================================================

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hostname = request.nextUrl.hostname;
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

    // Check if identifier looks like a Firebase UID (long, 20+ chars)
    if (identifier && UUID_PATTERN.test(identifier)) {
      console.log(`🔍 Detected old UID URL: /${routeType}/${identifier}`);

      // Resolve to username
      const username = await getUsernameByUserId(identifier);

      if (username) {
        // Build new URL with username
        const newPath = pathname.replace(identifier, username);
        const newUrl = new URL(newPath, request.url);

        // Preserve query params
        newUrl.search = request.nextUrl.search;

        console.log(`✅ 301 Redirect: ${pathname} → ${newPath}`);

        // ✅ SERVER-SIDE 301 (SEO-friendly permanent redirect)
        return NextResponse.redirect(newUrl, 301);
      }
    }
  }

  // ==========================================================================
  // STEP 0.5: flowauxi.com → shop.flowauxi.com redirect (301 Permanent)
  // Product Hygiene: Prevent "broken link" perception
  // ==========================================================================
  if (hostname === "flowauxi.com" || hostname === "www.flowauxi.com") {
    const shopRoutes = [
      "/dashboard",
      "/products",
      "/orders",
      "/messages",
      "/bot-settings",
      "/profile",
    ];

    for (const route of shopRoutes) {
      if (pathname === route || pathname.startsWith(`${route}/`)) {
        // 301 Permanent Redirect to shop subdomain
        const shopUrl = new URL(request.url);
        shopUrl.hostname = "shop.flowauxi.com";
        console.log(
          `📦 [SHOP REDIRECT] ${pathname} → shop.flowauxi.com${pathname}`,
        );
        return NextResponse.redirect(shopUrl, 301);
      }
    }
  }

  // ==========================================================================
  // STEP 0.6: shop.flowauxi.com fast-fail enforcement (server-side blocking)
  // Enterprise Trust Rule: Server-side blocking is mandatory
  // ==========================================================================
  if (hostname === "shop.flowauxi.com") {
    const blockedRoutes = [
      "/showcase",
      "/campaigns",
      "/bulk-messages",
      "/templates",
      "/contacts",
      "/appointments",
      "/services",
      "/whatsapp-admin",
    ];

    for (const route of blockedRoutes) {
      if (pathname === route || pathname.startsWith(`${route}/`)) {
        console.warn(
          `🚫 [SHOP DOMAIN] Blocked access to ${pathname} - redirecting to dashboard`,
        );
        // 307 Temporary Redirect (preserves POST if any)
        return NextResponse.redirect(new URL("/dashboard", request.url), 307);
      }
    }
  }

  // ==========================================================================
  // STEP 1: Domain-aware routing (delegated to domain-policy.ts)
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
  // STEP 2: API Routes - Let them handle their own auth
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
  // STEP 3: Auth checks for page routes
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
