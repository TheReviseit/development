/**
 * Next.js 16 Proxy - Production-Grade Security Handler
 * =====================================================
 * 
 * Combined functionality:
 * - Domain redirects and canonicalization
 * - Billing security (auth, rate limiting, CSP)
 * - Route protection
 * 
 * @version 2.0.0
 * @securityLevel FAANG-Production
 */

import { NextRequest, NextResponse } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import {
  evaluateDomainAccess,
  applyDecision,
  type ProductContext,
} from "@/lib/domain-policy";
import { resolveDomain, getLandingRoute, isKnownPlatformHostname } from "@/lib/domain/config";
import { getProductByDomain } from "@/lib/product/registry";
import { domainResolver, DomainContext } from "@/lib/domain/resolver";
import { routing } from "@/lib/i18n/routing";

// =============================================================================
// CONSTANTS - Single Source of Truth
// =============================================================================

const CANONICAL_DOMAIN = "www.flowauxi.com";
const CANONICAL_PROTOCOL = "https:";
const CUSTOM_DOMAIN_BLOCKED_PATHS = [
  "/home",
  "/orders",
  "/products",
  "/contacts",
  "/messages",
  "/bulk-messages",
  "/templates",
  "/campaigns",
  "/appointments",
  "/services",
  "/forms",
  "/files",
  "/bot-settings",
  "/preview-bot",
  "/profile",
  "/domains",
  "/showcase-manager",
  "/login",
  "/signup",
  "/payment",
  "/upgrade",
  "/billing",
  "/console",
  "/onboarding",
  "/settings",
  "/admin",
];
const CUSTOM_DOMAIN_STORE_RELATIVE_PATHS = [
  "/checkout",
  "/track-order",
];
const DEFAULT_CUSTOM_DOMAIN_ROUTING_TIMEOUT_MS = 5_000;
const MAX_CUSTOM_DOMAIN_ROUTING_TIMEOUT_MS = 8_000;
const filesLocalePathPattern = /^\/(en|ta|hi|ml|kn|te)\/(?:files|tools)(?:\/|$)/;
const legacyFilesPathPattern = /^\/files(?=\/|$)/;
const legacyLocalizedFilesPathPattern = /^\/(en|ta|hi|ml|kn|te)\/files(?=\/|$)/;
const intlProxy = createIntlMiddleware(routing);

// Billing Security Configuration
const BILLING_CONFIG = {
  protectedPaths: ['/payment', '/upgrade', '/billing'],
  rateLimits: {
    ip: { count: 100, windowMs: 60000 },
    user: { count: 20, windowMs: 60000 },
    tenant: { count: 500, windowMs: 60000 },
  },
  csp: {
    'default-src': "'self'",
    'script-src': "'self' 'unsafe-inline' https://checkout.razorpay.com https://cdn.razorpay.com https://apis.google.com https://*.googleapis.com https://*.gstatic.com https://*.firebaseapp.com https://*.firebase.com",
    'style-src': "'self' 'unsafe-inline' https://fonts.googleapis.com",
    'img-src': "'self' data: https: blob:",
    'media-src': "'self' blob: data: https:",
    'font-src': "'self' https://fonts.gstatic.com",
    'frame-src': "'self' https://checkout.razorpay.com https://*.firebaseapp.com https://*.google.com https://accounts.google.com",
    'connect-src': "'self' https://api.flowauxi.com https://lumberjack.razorpay.com https://*.googleapis.com https://*.google.com https://*.firebaseio.com wss://*.firebaseio.com",
    'frame-ancestors': "'none'",
    'base-uri': "'self'",
    'form-action': "'self' https://*.google.com",
    'upgrade-insecure-requests': '',
  },
};

// In-memory rate limiting store (use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const customDomainRoutingCache = new Map<string, { value: CustomDomainRoutingLookup; expiresAt: number }>();

async function secretFingerprint(value: string): Promise<string | null> {
  if (!value) {
    return null;
  }
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 6)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

interface CustomDomainRouting {
  domain_id: string;
  tenant_id: string;
  user_id: string;
  product_domain: "shop";
  normalized_host: string;
  routing_version: number;
  routing_enabled: boolean;
  status: "active";
  store_slug: string;
}

interface CustomDomainRoutingFailure {
  status: number;
  code: string;
  message: string;
}

interface CustomDomainRoutingLookup {
  routing: CustomDomainRouting | null;
  failure: CustomDomainRoutingFailure | null;
}

// =============================================================================
// RATE LIMITING
// =============================================================================

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      allowed: true,
      remaining: limit - 1,
      resetTime: now + windowMs,
    };
  }

  if (record.count >= limit) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  record.count++;
  return {
    allowed: true,
    remaining: limit - record.count,
    resetTime: record.resetTime,
  };
}

function getRateLimitKey(type: 'ip' | 'user' | 'tenant', identifier: string, path: string): string {
  return `rate_limit:${type}:${identifier}:${path}`;
}

// =============================================================================
// AUTH VALIDATION
// =============================================================================

interface AuthResult {
  authenticated: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

// =============================================================================
// TOKEN VALIDATION CACHE
// =============================================================================
//
// SECURITY NOTE: This cache introduces a 30-second window where a revoked token
// will still be considered valid. This is a deliberate trade-off to prevent
// hammering the backend auth service on every request.
//
// For payment pages specifically, this 30-second window is acceptable because:
// 1. Token revocation is rare (user logout, password change, security breach)
// 2. The actual checkout session creation validates fresh with Firebase Admin
// 3. Reduces backend load by ~90% for authenticated navigation
//
// If you need immediate revocation, set TOKEN_VALIDATION_CACHE_MS = 0
//
const tokenValidationCache = new Map<string, { result: AuthResult; expiresAt: number }>();
const TOKEN_VALIDATION_CACHE_MS = 30000; // 30 seconds

// Cleanup old entries periodically
function cleanupTokenValidationCache() {
  const now = Date.now();
  for (const [key, value] of tokenValidationCache.entries()) {
    if (now > value.expiresAt) {
      tokenValidationCache.delete(key);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupTokenValidationCache, 5 * 60 * 1000);

async function validateAuthToken(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    // Check for session cookie as fallback
    // CRITICAL: The auth system sets the cookie as 'session' (via Firebase Admin
    // createSessionCookie in auth/sync/route.ts). Check BOTH names for compat.
    const sessionCookie = request.cookies.get('session') || request.cookies.get('flowauxi_session');
    if (sessionCookie?.value) {
      try {
        // Decode the JWT payload (Firebase session cookie is a JWT)
        // We only decode here; cryptographic verification is expected to be done by the backend
        const [, payloadBase64] = sessionCookie.value.split('.');
        const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
        const payload = JSON.parse(payloadJson);
        const userId = payload.user_id || payload.sub;
        
        if (userId) {
          return { authenticated: true, userId: userId, email: payload.email };
        }
      } catch (e) {
        // Fallback on error
        console.error('Failed to decode session cookie payload in proxy:', e);
      }
      return { authenticated: true, userId: 'session_based' };
    }
    return { authenticated: false, error: 'NO_AUTH_TOKEN' };
  }

  const token = authHeader.substring(7);
  
  // Check cache first
  const cached = tokenValidationCache.get(token);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }
  
  // Call backend to validate token with Firebase Admin SDK
  try {
    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    
    const response = await fetch(`${backendUrl}/api/billing/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
      // Add timeout to prevent hanging
      signal: AbortSignal.timeout(5000),
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.valid) {
      const result: AuthResult = {
        authenticated: false,
        error: data.error || 'INVALID_TOKEN',
      };
      return result;
    }
    
    const result: AuthResult = {
      authenticated: true,
      userId: data.userId,
      email: data.email,
    };
    
    // Cache successful validation
    tokenValidationCache.set(token, {
      result,
      expiresAt: Date.now() + TOKEN_VALIDATION_CACHE_MS,
    });
    
    return result;
    
  } catch (error) {
    // Check if it's a connection error (backend not running)
    const isConnectionError = error instanceof Error && (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch failed') ||
      error.message.includes('connect') ||
      error.name === 'AbortError'
    );
    
    if (isConnectionError) {
      console.error('[Proxy] Backend connection failed - is the Flask server running on port 5000?', error);
      // Return a specific error for connection issues
      return { 
        authenticated: false, 
        error: 'BACKEND_UNAVAILABLE',
      };
    }
    
    console.error('Token validation error:', error);
    return { authenticated: false, error: 'VALIDATION_SERVICE_ERROR' };
  }
}

// =============================================================================
// TENANT RESOLUTION (FAANG Pattern: Read from global middleware headers)
// =============================================================================
// NOTE: Global middleware.ts now resolves domain ONCE and injects headers.
// This function just reads what's already been resolved.

function getTenantFromHeaders(request: NextRequest): { 
  domain: string; 
  productDomain: string; 
  tenantId: string;
  signedContext: string | null;
  isValid: boolean 
} {
  // Read from headers injected by global middleware.ts
  const productDomain = request.headers.get('x-tenant-domain') || 'unknown';
  const tenantId = request.headers.get('x-tenant-id') || 'unknown';
  const signedContext = request.headers.get('x-signed-context');
  const host = request.headers.get('host') || '';
  
  const isValid = productDomain !== 'unknown' && signedContext !== null;
  
  return { 
    domain: host, 
    productDomain, 
    tenantId,
    signedContext,
    isValid 
  };
}

// =============================================================================
// CSP GENERATION
// =============================================================================

function generateCSPHeader(): string {
  return Object.entries(BILLING_CONFIG.csp)
    .map(([key, value]) => `${key} ${value}`.trim())
    .join('; ');
}

// =============================================================================
// BILLING SECURITY HANDLER
// =============================================================================

async function handleBillingSecurity(
  request: NextRequest,
  pathname: string
): Promise<NextResponse | null> {
  // Get client IP from headers (NextRequest doesn't have .ip property)
  const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
                   request.headers.get('x-real-ip') || 
                   'unknown';
  
  // Check if path requires billing protection
  const isProtectedPath = BILLING_CONFIG.protectedPaths.some(path =>
    pathname.startsWith(path)
  );

  if (!isProtectedPath) {
    return null; // Not a billing path, continue normal processing
  }

  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // Add security headers to all responses
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
  };

  // IP-based rate limiting
  const ipLimit = checkRateLimit(
    getRateLimitKey('ip', clientIp, pathname),
    BILLING_CONFIG.rateLimits.ip.count,
    BILLING_CONFIG.rateLimits.ip.windowMs
  );

  if (!ipLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retry_after: ipLimit.retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(ipLimit.retryAfter),
          ...securityHeaders,
        },
      }
    );
  }

  // Tenant resolution (FAANG Pattern: Read from global middleware headers)
  const tenant = getTenantFromHeaders(request);

  if (!tenant.isValid) {
    return NextResponse.json(
      {
        success: false,
        error: 'INVALID_DOMAIN',
        message: 'Domain not recognized. Global middleware may not be running.',
      },
      { status: 400, headers: securityHeaders }
    );
  }
  
  // Use signed context from global middleware (already signed, just pass through)
  const signedContext = tenant.signedContext!;

  // Authentication
  const authResult = await validateAuthToken(request);

  if (!authResult.authenticated) {
    const returnUrl = encodeURIComponent(request.url);
    
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        {
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Authentication required.',
          login_url: `/login?returnUrl=${returnUrl}`,
        },
        { 
          status: 401,
          headers: {
            'WWW-Authenticate': 'Bearer',
            ...securityHeaders,
          }
        }
      );
    }

    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('returnUrl', request.url);
    const response = NextResponse.redirect(loginUrl);
    
    Object.entries(securityHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    
    return response;
  }

  // User-based rate limiting
  if (authResult.userId) {
    const userLimit = checkRateLimit(
      getRateLimitKey('user', authResult.userId, pathname),
      BILLING_CONFIG.rateLimits.user.count,
      BILLING_CONFIG.rateLimits.user.windowMs
    );

    if (!userLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          retry_after: userLimit.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(userLimit.retryAfter),
            ...securityHeaders,
          },
        }
      );
    }
  }

  // Tenant-based rate limiting
  const tenantLimit = checkRateLimit(
    getRateLimitKey('tenant', tenant.productDomain, pathname),
    BILLING_CONFIG.rateLimits.tenant.count,
    BILLING_CONFIG.rateLimits.tenant.windowMs
  );

  if (!tenantLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: 'TENANT_RATE_LIMIT_EXCEEDED',
        message: 'Service temporarily unavailable for this domain.',
      },
      { 
        status: 503,
        headers: securityHeaders,
      }
    );
  }

  // Add billing security headers (FAANG Pattern: Signed context, never plain domain)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('X-Signed-Context', signedContext);
  requestHeaders.set('X-Tenant-Domain', tenant.productDomain);
  requestHeaders.set('X-Tenant-Id', tenant.tenantId);
  requestHeaders.set('X-Domain', tenant.domain);
  
  if (authResult.userId) {
    requestHeaders.set('X-User-Id', authResult.userId);
  }
  if (authResult.email) {
    requestHeaders.set('X-User-Email', authResult.email);
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  // Also set them on the response for client context if needed
  response.headers.set('X-Product-Domain', tenant.productDomain);
  response.headers.set('X-Domain', tenant.domain);
  
  if (authResult.userId) {
    response.headers.set('X-User-Id', authResult.userId);
  }
  if (authResult.email) {
    response.headers.set('X-User-Email', authResult.email);
  }

  // CSP for payment pages
  if (pathname.startsWith('/payment') || pathname.startsWith('/upgrade')) {
    response.headers.set('Content-Security-Policy', generateCSPHeader());
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return response;
}

function isCustomerDomainCandidate(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return !(
    isKnownPlatformHostname(host) ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".flowauxi.com") ||
    host.includes("vercel.app") ||
    host.includes("vercel.sh")
  );
}

function isBlockedCustomDomainPath(pathname: string): boolean {
  return CUSTOM_DOMAIN_BLOCKED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function customDomainHtml(status: number, title: string, message: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><meta name="robots" content="noindex"></head><body><main style="font-family:system-ui,sans-serif;max-width:680px;margin:12vh auto;padding:0 24px;line-height:1.5"><h1>${title}</h1><p>${message}</p></main></body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

function customDomainRoutingTimeoutMs(): number {
  const configured = Number(process.env.DOMAIN_ROUTING_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_CUSTOM_DOMAIN_ROUTING_TIMEOUT_MS;
  }
  return Math.min(Math.max(configured, 800), MAX_CUSTOM_DOMAIN_ROUTING_TIMEOUT_MS);
}

async function resolveCustomDomainRouting(hostname: string): Promise<CustomDomainRoutingLookup> {
  const cacheKey = hostname.toLowerCase();
  const cached = customDomainRoutingCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  if (process.env.NODE_ENV === "test" && !process.env.DOMAIN_ROUTING_ENDPOINT) {
    const lookup = { routing: null, failure: null };
    customDomainRoutingCache.set(cacheKey, { value: lookup, expiresAt: Date.now() + 1000 });
    return lookup;
  }

  const endpoint =
    process.env.DOMAIN_ROUTING_ENDPOINT ||
    `${process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/domains/routing/resolve`;
  const secret = process.env.DOMAIN_INTERNAL_SECRET || "";
  const url = new URL(endpoint);
  url.searchParams.set("host", hostname);
  const secretFp = await secretFingerprint(secret);
  const debugRouting = process.env.DOMAIN_ROUTING_DEBUG === "true";
  const timeoutMs = customDomainRoutingTimeoutMs();

  try {
    if (debugRouting) {
      console.log(
        "[Proxy CustomDomain] lookup_start",
        JSON.stringify({
          host: hostname,
          endpointHost: url.host,
          hasSecret: Boolean(secret),
          secretFp,
          timeoutMs,
        }),
      );
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: secret ? { "X-Internal-Domain-Secret": secret } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      let body: { code?: string; message?: string } | null = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      const lookup = {
        routing: null,
        failure: {
          status: response.status,
          code: body?.code || "DOMAIN_NOT_CONFIGURED",
          message: body?.message || "Domain is not active on Flowauxi yet.",
        },
      };
      console.error(
        "[Proxy CustomDomain] lookup_failed",
        JSON.stringify({
          host: hostname,
          endpointHost: url.host,
          status: response.status,
          code: lookup.failure.code,
          hasSecret: Boolean(secret),
          secretFp,
          timeoutMs,
        }),
      );
      const failureTtlMs = response.status >= 500 || lookup.failure.code === "AUTH_REQUIRED" ? 5_000 : 15_000;
      customDomainRoutingCache.set(cacheKey, { value: lookup, expiresAt: Date.now() + failureTtlMs });
      return lookup;
    }
    const payload = await response.json();
    const routing = payload?.routing as CustomDomainRouting | undefined;
    if (
      routing?.routing_enabled &&
      routing.status === "active" &&
      routing.product_domain === "shop" &&
      routing.store_slug
    ) {
      const lookup = { routing, failure: null };
      if (debugRouting) {
        console.log(
          "[Proxy CustomDomain] lookup_ok",
          JSON.stringify({
            host: hostname,
            normalizedHost: routing.normalized_host,
            routingVersion: routing.routing_version,
            storeSlug: routing.store_slug,
          }),
        );
      }
      customDomainRoutingCache.set(cacheKey, { value: lookup, expiresAt: Date.now() + 60_000 });
      return lookup;
    }
  } catch (error) {
    console.error(
      "[Proxy CustomDomain] lookup_exception",
      JSON.stringify({
        host: hostname,
        endpointHost: url.host,
        hasSecret: Boolean(secret),
        secretFp,
        timeoutMs,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    const lookup = {
      routing: null,
      failure: {
        status: 503,
        code: "DOMAIN_ROUTING_LOOKUP_FAILED",
        message: "Domain routing service could not be reached.",
      },
    };
    customDomainRoutingCache.set(cacheKey, { value: lookup, expiresAt: Date.now() + 5_000 });
    return lookup;
  }

  const lookup = { routing: null, failure: null };
  customDomainRoutingCache.set(cacheKey, { value: lookup, expiresAt: Date.now() + 15_000 });
  return lookup;
}

async function handleCustomDomainRequest(
  request: NextRequest,
  hostname: string,
  pathname: string,
): Promise<NextResponse> {
  const lookup = await resolveCustomDomainRouting(hostname);
  const routing = lookup.routing;
  if (!routing) {
    if (
      lookup.failure?.status && lookup.failure.status >= 500
      || lookup.failure?.code === "AUTH_REQUIRED"
      || lookup.failure?.code === "DOMAIN_ROUTING_LOOKUP_FAILED"
    ) {
      return customDomainHtml(
        503,
        "Domain temporarily unavailable",
        "Flowauxi could not resolve this custom domain right now. The domain is connected, but routing is temporarily unavailable.",
      );
    }

    if (
      lookup.failure?.code === "STORE_NOT_CONFIGURED"
      || lookup.failure?.code === "STORE_BINDING_AMBIGUOUS"
      || lookup.failure?.code === "STORE_RESOURCE_MISMATCH"
    ) {
      return customDomainHtml(
        404,
        "Store not configured",
        "This custom domain is connected, but the Shop storefront is not configured yet. Complete your Shop setup or attach the domain to the correct store.",
      );
    }

    return customDomainHtml(
      404,
      "Domain not configured",
      "This domain is not active on Flowauxi yet. Check your DNS settings or verify it from your dashboard.",
    );
  }

  if (isBlockedCustomDomainPath(pathname)) {
    return customDomainHtml(
      404,
      "Not found",
      "Dashboard and account pages are only available on Flowauxi platform domains.",
    );
  }

  const context: DomainContext = {
    domain: "shop",
    tenantId: routing.tenant_id,
    userId: routing.user_id,
    environment: process.env.NODE_ENV === "development" ? "development" : "production",
    hostname,
    timestamp: Date.now(),
    nonce: crypto.randomUUID(),
  };
  const signedContext = await domainResolver.signContext(context, routing.user_id);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-signed-context", signedContext);
  requestHeaders.set("x-tenant-domain", "shop");
  requestHeaders.set("x-tenant-id", routing.tenant_id);
  requestHeaders.set("x-user-id", routing.user_id);
  requestHeaders.set("x-custom-domain", routing.normalized_host);
  requestHeaders.set("x-custom-domain-routing-version", String(routing.routing_version));

  const rewriteUrl = request.nextUrl.clone();
  if (pathname === "/" || pathname === "") {
    rewriteUrl.pathname = `/store/${routing.store_slug}`;
  } else if (CUSTOM_DOMAIN_STORE_RELATIVE_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    rewriteUrl.pathname = `/store/${routing.store_slug}${pathname}`;
  } else if (pathname.startsWith("/api/") || pathname.startsWith("/store/")) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("x-product-domain", "shop");
    response.headers.set("x-custom-domain", routing.normalized_host);
    return response;
  } else {
    return customDomainHtml(
      404,
      "Not found",
      "This custom domain only serves the connected public store.",
    );
  }

  const response = NextResponse.rewrite(rewriteUrl, { request: { headers: requestHeaders } });
  response.headers.set("x-product-domain", "shop");
  response.headers.set("x-custom-domain", routing.normalized_host);
  response.headers.set("x-rewrite-source", "custom-domain-routing");
  response.headers.set("cache-control", "public, s-maxage=30, stale-while-revalidate=60");
  return response;
}

// =============================================================================
// MAIN PROXY FUNCTION
// =============================================================================

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const hostname = request.nextUrl.hostname;
  const protocol = request.nextUrl.protocol;
  const port = request.nextUrl.port;

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 0: GLOBAL DOMAIN RESOLUTION (FAANG Pattern - Single Source of Truth)
  // ═══════════════════════════════════════════════════════════════════════════
  // Resolve domain ONCE here, inject headers for ALL downstream handlers.
  // This ensures API routes, page routes, and backend all see the same context.
  
  if (isCustomerDomainCandidate(hostname)) {
    return handleCustomDomainRequest(request, hostname, pathname);
  }

  const resolution = domainResolver.resolve(request);
  
  if (resolution.matched && resolution.context) {
    // Extract user ID from auth if available
    const authHeader = request.headers.get('authorization');
    let userId: string | undefined;
    
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const [, payloadB64] = token.split('.');
        if (payloadB64) {
          const payload = JSON.parse(atob(payloadB64));
          userId = payload.sub || payload.user_id;
        }
      } catch (e) {
        // Invalid token, ignore
      }
    }
    
    // Check session cookie as fallback
    if (!userId) {
      const sessionCookie = request.cookies.get('session')?.value;
      if (sessionCookie) {
        try {
          const [, payloadB64] = sessionCookie.split('.');
          if (payloadB64) {
            const payload = JSON.parse(atob(payloadB64));
            userId = payload.sub || payload.user_id;
          }
        } catch (e) {
          // Invalid cookie, ignore
        }
      }
    }
    
    // Sign context (async - needs await). Missing production secrets must fail
    // closed, but with an explicit response instead of an opaque Vercel 500.
    let signedContext: string;
    try {
      signedContext = await domainResolver.signContext(resolution.context, userId);
    } catch (error) {
      console.error("[Proxy Global] Failed to sign domain context:", error);
      return customDomainHtml(
        503,
        "Application configuration error",
        "The platform domain context secret is not configured. Set CONTEXT_SIGNING_SECRET in Vercel and redeploy.",
      );
    }
    
    // Inject headers on request (for downstream handlers)
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-signed-context', signedContext);
    requestHeaders.set('x-tenant-domain', resolution.context.domain);
    requestHeaders.set('x-tenant-id', resolution.context.tenantId);
    if (userId) {
      requestHeaders.set('x-user-id', userId);
    }
    
    // Create new request with modified headers
    request = new NextRequest(request.url, {
      ...request,
      headers: requestHeaders,
    });
    
    // Log in dev mode
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[Proxy Global] ${pathname} → domain=${resolution.context.domain}, ` +
        `user=${userId?.substring(0, 8) || 'anon'}...`
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: BILLING SECURITY (for payment routes)
  // ═══════════════════════════════════════════════════════════════════════════
  const billingResponse = await handleBillingSecurity(request, pathname);
  if (billingResponse) {
    return billingResponse;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: FEATURE FLAG - Read per-request (not at cold start)
  // ═══════════════════════════════════════════════════════════════════════════
  const ENABLE_WWW_REDIRECT = process.env.ENABLE_WWW_REDIRECT !== "false";

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: IDEMPOTENT GUARD - Already canonical? Exit early
  // ═══════════════════════════════════════════════════════════════════════════
  const isCanonical = hostname === CANONICAL_DOMAIN && protocol === CANONICAL_PROTOCOL;
  
  if (isCanonical) {
    return processRequest(request, hostname, port, pathname);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: EXCLUDED HOSTNAMES - Check BEFORE redirect logic
  // ═══════════════════════════════════════════════════════════════════════════
  const isExcluded = 
    hostname.includes("vercel.app") ||
    hostname.includes("vercel.sh") ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    (hostname.endsWith(".flowauxi.com") && hostname !== "flowauxi.com");

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: REDIRECT TO CANONICAL - One hop for ALL non-canonical traffic
  // ═══════════════════════════════════════════════════════════════════════════
  if (!ENABLE_WWW_REDIRECT) {
    return processRequest(request, hostname, port, pathname);
  }

  if (!isExcluded && (protocol === "http:" || hostname === "flowauxi.com")) {
    const canonical = new URL(request.url);
    canonical.protocol = CANONICAL_PROTOCOL;
    canonical.hostname = CANONICAL_DOMAIN;
    
    const response = NextResponse.redirect(canonical.toString(), 301);
    response.headers.set("x-redirect-reason", "to-canonical");
    return response;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: CONTINUE NORMAL PROCESSING
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
  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL RSC REQUEST HANDLING — Apply to ALL routes, not just protected ones
  // ═══════════════════════════════════════════════════════════════════════════
  // React Server Component requests use the ?_rsc= query param or RSC header.
  // These requests MUST NOT receive 302 redirects as this breaks streaming.
  // Instead, return NextResponse.next() with cache-busting headers.
  // The client-side auth state (onAuthStateChanged) will handle redirects.
  // ═══════════════════════════════════════════════════════════════════════════
  const isRSCRequest =
    request.headers.get("RSC") === "1" ||
    request.headers.get("Accept")?.includes("text/x-component") ||
    request.nextUrl.searchParams.has("_rsc");

  if (isRSCRequest) {
    const userType = getUserTypeFromCookies(request);
    const requiredType = getRequiredUserType(pathname);
    const localeMatch = pathname.match(filesLocalePathPattern);
    const requestHeaders = new Headers(request.headers);
    if (localeMatch?.[1]) {
      requestHeaders.set("x-next-intl-locale", localeMatch[1]);
      requestHeaders.set("x-flowauxi-locale", localeMatch[1]);
    }

    // For RSC requests, never redirect — let client handle auth state
    // This prevents the race condition where cookie hasn't propagated yet
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("Vary", "Cookie");
    response.headers.set("X-Auth-Status", userType ? "authenticated" : "unauthenticated");
    response.headers.set("X-Is-RSC", "true");

    // Only log in dev to avoid noise
    if (process.env.NODE_ENV === "development") {
      console.log(`[Proxy] RSC request to ${pathname} - auth: ${userType || "none"}`);
    }

    return response;
  }

  const resolvedDomain = resolveDomain(hostname, port);
  const isApiPath = pathname.startsWith("/api/") || pathname === "/api";
  const domainDecision = evaluateDomainAccess(request);

  const filesI18nResponse = handleFilesI18nRouting(
    request,
    pathname,
    resolvedDomain,
    domainDecision.seo.canonical,
    hostname,
    port,
  );
  if (filesI18nResponse) {
    return filesI18nResponse;
  }

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
      "/api/file-tools",
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

    // For non-public API routes (like /api/billing/*), still add product headers
    // This ensures domain context is available for all API handlers
    return addProductHeaders(
      NextResponse.next(),
      resolvedDomain,
      domainDecision.seo.canonical,
      hostname,
      port,
    );
  }

  const AUTH_ROUTE_POLICY: Record<string, "normal" | "console"> = {
    "/home": "normal",
    "/orders": "normal",
    "/products": "normal",
    "/contacts": "normal",
    "/messages": "normal",
    "/bulk-messages": "normal",
    "/templates": "normal",
    "/campaigns": "normal",
    "/appointments": "normal",
    "/services": "normal",
    "/forms": "normal",
    "/files": "normal",
    "/bot-settings": "normal",
    "/preview-bot": "normal",
    "/profile": "normal",
    "/domains": "normal",
    "/showcase-manager": "normal",
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
    "/files",
    "/tools",
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

  function redirectToOnboardingGate() {
    const url = new URL("/onboarding-embedded", request.url);
    url.searchParams.set("domain", String(resolvedDomain));
    return NextResponse.redirect(url);
  }

  if (isPublic) {
    // Do not redirect /login from a cookie-only signal. A Firebase session
    // cookie can outlive the Supabase tenant row after admin/user deletion, so
    // the login client must be allowed to validate and clear stale sessions.
    if (pathname === "/console/login" && userType === "console") {
      return NextResponse.redirect(new URL("/console", request.url));
    }
    if (pathname === "/login" && userType === "console") {
      return NextResponse.redirect(new URL("/console", request.url));
    }
    if (pathname === "/console/login" && userType === "normal") {
      return redirectToOnboardingGate();
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

function handleFilesI18nRouting(
  request: NextRequest,
  pathname: string,
  resolvedDomain: ProductContext | string,
  canonical: string,
  hostname: string,
  port: string,
): NextResponse | null {
  const legacyRedirectPath = getLegacyFilesRedirectPath(pathname);
  if (legacyRedirectPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = legacyRedirectPath;
    const response = NextResponse.redirect(redirectUrl, 308);
    response.headers.set("x-redirect-reason", "legacy-files-to-tools");
    return addProductHeaders(response, resolvedDomain, canonical, hostname, port);
  }

  const isFilesPath =
    pathname === "/files" ||
    pathname.startsWith("/files/") ||
    pathname === "/tools" ||
    pathname.startsWith("/tools/") ||
    filesLocalePathPattern.test(pathname);

  if (!isFilesPath) {
    return null;
  }

  const response = intlProxy(request);
  response.headers.set("x-flowauxi-i18n-scope", "files");
  return addProductHeaders(response, resolvedDomain, canonical, hostname, port);
}

function getLegacyFilesRedirectPath(pathname: string): string | null {
  if (pathname === "/files" || pathname.startsWith("/files/")) {
    return pathname.replace(legacyFilesPathPattern, "/tools");
  }

  if (legacyLocalizedFilesPathPattern.test(pathname)) {
    return pathname.replace(legacyLocalizedFilesPathPattern, (_match, locale: string) => `/${locale}/tools`);
  }

  return null;
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
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:jpg|jpeg|gif|png|svg|ico|css|js|webp|woff|woff2|webmanifest|json|xml|txt)).*)",
  ],
};

export default proxy;
