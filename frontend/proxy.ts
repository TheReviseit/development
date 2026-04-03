/**
 * Next.js 16 Proxy - Production-Grade Redirect Handler
 * ======================================================
 * 
 * Canonical: https://www.flowauxi.com
 * Single source of truth - no CDN redirects
 * 
 * Features:
 * - One-hop redirect (http://flowauxi.com → https://www.flowauxi.com)
 * - Feature flag for instant rollback
 * - Subdomain protection (shop.flowauxi.com never redirects)
 * - Idempotent guard prevents loops by construction
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  evaluateDomainAccess,
  applyDecision,
  type ProductContext,
} from "@/lib/domain-policy";
import { resolveDomain, getLandingRoute } from "@/lib/domain/config";
import { getProductByDomain } from "@/lib/product/registry";

// =============================================================================
// CONSTANTS - Single Source of Truth
// =============================================================================

const CANONICAL_DOMAIN = "www.flowauxi.com";
const CANONICAL_PROTOCOL = "https:";

// =============================================================================
// PROXY FUNCTION
// =============================================================================

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hostname = request.nextUrl.hostname;
  const protocol = request.nextUrl.protocol;
  const port = request.nextUrl.port;

  // ═══════════════════════════════════════════════════════════════════════════
  // FEATURE FLAG - Read per-request (not at cold start)
  // ═══════════════════════════════════════════════════════════════════════════
  const ENABLE_WWW_REDIRECT = process.env.ENABLE_WWW_REDIRECT !== "false";

  // ═══════════════════════════════════════════════════════════════════════════
  // IDEMPOTENT GUARD - Already canonical? Exit early
  // ═══════════════════════════════════════════════════════════════════════════
  // This IS the loop guard. By construction, if hostname === CANONICAL_DOMAIN
  // and protocol === https:, NO redirect runs. Loop is impossible.
  const isCanonical = hostname === CANONICAL_DOMAIN && protocol === CANONICAL_PROTOCOL;
  
  if (isCanonical) {
    return processRequest(request, hostname, port, pathname);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXCLUDED HOSTNAMES - Check BEFORE redirect logic
  // ═══════════════════════════════════════════════════════════════════════════
  // Important: Check this FIRST, before http: redirect condition
  const isExcluded = 
    hostname.includes("vercel.app") ||
    hostname.includes("vercel.sh") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    (hostname.endsWith(".flowauxi.com") && hostname !== "flowauxi.com");

  // ═══════════════════════════════════════════════════════════════════════════
  // REDIRECT TO CANONICAL - One hop for ALL non-canonical traffic
  // ═══════════════════════════════════════════════════════════════════════════
  // Handles: http://flowauxi.com, https://flowauxi.com → https://www.flowauxi.com
  // Skips: subdomains (shop.flowauxi.com), localhost, vercel previews
  
  if (!ENABLE_WWW_REDIRECT) {
    return processRequest(request, hostname, port, pathname);
  }

  if (!isExcluded && (protocol === "http:" || hostname === "flowauxi.com")) {
    // ONE redirect to canonical - not two hops
    const canonical = new URL(request.url);
    canonical.protocol = CANONICAL_PROTOCOL;
    canonical.hostname = CANONICAL_DOMAIN;
    
    const response = NextResponse.redirect(canonical.toString(), 301);
    response.headers.set("x-redirect-reason", "to-canonical");
    return response;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTINUE NORMAL PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════
  return processRequest(request, hostname, port, pathname);
}

// =============================================================================
// HELPER: Process request after redirect checks
// =============================================================================

async function processRequest(
  request: NextRequest,
  hostname: string,
  port: string,
  pathname: string
) {
  const resolvedDomain = resolveDomain(hostname, port);
  const isApiPath = pathname.startsWith("/api/") || pathname === "/api";
  const domainDecision = evaluateDomainAccess(request);

  if (pathname === "/") {
    const domain = resolveDomain(hostname, port);
    const targetLanding = getLandingRoute(domain);

    if (targetLanding && targetLanding !== "/" && targetLanding !== pathname) {
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = targetLanding;
      const response = NextResponse.rewrite(rewriteUrl);
      response.headers.set("x-product-domain", domain);
      response.headers.set("x-landing-page", targetLanding);
      response.headers.set("x-rewrite-source", "middleware-landing");
      response.headers.set("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
      return response;
    }

    if (targetLanding === "/" || targetLanding === pathname) {
      return addProductHeaders(
        NextResponse.next(),
        resolvedDomain,
        domainDecision.seo.canonical,
        hostname,
        port,
      );
    }
  }

  if (domainDecision.rewrite) {
    return applyDecision(domainDecision, request);
  }

  if (!domainDecision.allowed && domainDecision.redirect) {
    return applyDecision(domainDecision, request);
  }

  if (isApiPath) {
    const isPublicApiRoute = [
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
      "/api/forms/public",
      "/api/forms/workspace",
    ].some(route => pathname.startsWith(route));

    if (isPublicApiRoute) {
      return addProductHeaders(
        NextResponse.next(),
        resolvedDomain,
        domainDecision.seo.canonical,
        hostname,
        port,
      );
    }
  }

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
    "/shop",
    "/marketing",
    "/form",
  ];

  function getUserTypeFromCookies(req: NextRequest): "normal" | "console" | null {
    const hasNormalSession = req.cookies.has("session") || req.cookies.has("flowauxi_session");
    const hasConsoleSession = req.cookies.has("otp_console_session") || req.cookies.has("flowauxi_console_session");
    if (hasNormalSession && hasConsoleSession) return null;
    if (hasConsoleSession) return "console";
    if (hasNormalSession) return "normal";
    return null;
  }

  function getRequiredUserType(path: string): "normal" | "console" | null {
    for (const [routePrefix, userType] of Object.entries(AUTH_ROUTE_POLICY)) {
      if (path.startsWith(routePrefix)) return userType;
    }
    return null;
  }

  function isPublicRoute(path: string): boolean {
    return PUBLIC_ROUTES.some(
      route => path === route || path.startsWith(`${route}/`),
    );
  }

  const userType = getUserTypeFromCookies(request);
  const requiredType = getRequiredUserType(pathname);
  const isPublic = isPublicRoute(pathname);

  if (isPublic) {
    if (pathname === "/login" && userType === "normal") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (pathname === "/console/login" && userType === "console") {
      return NextResponse.redirect(new URL("/console", request.url));
    }
    if (pathname === "/login" && userType === "console") {
      return NextResponse.redirect(new URL("/console", request.url));
    }
    if (pathname === "/console/login" && userType === "normal") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return addProductHeaders(
      NextResponse.next(),
      resolvedDomain,
      domainDecision.seo.canonical,
      hostname,
      port,
    );
  }

  if (requiredType && !userType) {
    const loginPath = requiredType === "console" ? "/console/login" : "/login";
    const url = new URL(loginPath, request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (requiredType && userType && userType !== requiredType) {
    const url = new URL("/error", request.url);
    url.searchParams.set("code", "WRONG_PORTAL");
    url.searchParams.set("expected", requiredType);
    url.searchParams.set("current", userType);
    return NextResponse.redirect(url);
  }

  return addProductHeaders(
    NextResponse.next(),
    resolvedDomain,
    domainDecision.seo.canonical,
    hostname,
    port,
  );
}

// =============================================================================
// HELPER: Add product context headers
// =============================================================================

function addProductHeaders(
  response: NextResponse,
  product: ProductContext | string,
  canonical: string,
  hostname?: string,
  port?: string,
): NextResponse {
  response.headers.set("x-product-context", product);
  response.headers.set("x-product-domain", product);
  response.headers.set("x-canonical-url", canonical);

  if (hostname) {
    const productConfig = getProductByDomain(hostname, port);
    response.headers.set("x-product-id", productConfig.id);
    response.headers.set("x-product-name", productConfig.name);
  }

  return response;
}

// =============================================================================
// CONFIG - Matcher (excludes static assets for edge performance)
// =============================================================================

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|gif|png|svg|ico|css|js|webp|woff|woff2|webmanifest|json|xml|txt)).*)",
  ],
};

export default proxy;
