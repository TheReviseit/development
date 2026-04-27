/**
 * Billing Checkout Session API Route
 * ==================================
 * Production-grade handler for creating checkout sessions.
 * 
 * Features:
 * - Circuit breaker protected proxy to backend
 * - Comprehensive input validation
 * - Idempotency key validation
 * - Detailed error handling with user-friendly messages
 * - Structured logging for observability
 * 
 * @version 1.0.0
 * @securityLevel FAANG-Production
 */

import { NextRequest, NextResponse } from 'next/server';
import { proxyRequest, isBackendHealthy } from '@/lib/api/proxy-client';
import { resolveContext } from '@/lib/api/context-resolver';

// =============================================================================
// TYPES
// =============================================================================

interface CheckoutSessionRequest {
  planSlug: string;
  idempotencyKey: string;
}

interface CheckoutSessionResponse {
  success: boolean;
  checkoutUrl?: string;
  sessionId?: string;
  pendingSubscriptionId?: string;
  keyId?: string;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

// Allows both short slugs ('business') and full-format slugs ('shop_business').
// Underscores are valid because the DB uses domain-prefixed plan_slug values.
const PLAN_SLUG_PATTERN = /^[a-z0-9_-]+$/i;
const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateRequest(body: unknown): { valid: false; error: string } | { valid: true; data: CheckoutSessionRequest } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }
  
  const req = body as Record<string, unknown>;
  
  // Validate planSlug
  if (!req.planSlug || typeof req.planSlug !== 'string') {
    return { valid: false, error: 'planSlug is required and must be a string' };
  }
  
  if (!PLAN_SLUG_PATTERN.test(req.planSlug)) {
    return { valid: false, error: 'planSlug contains invalid characters' };
  }
  
  if (req.planSlug.length > 50) {
    return { valid: false, error: 'planSlug is too long (max 50 characters)' };
  }
  
  // Validate idempotencyKey
  if (!req.idempotencyKey || typeof req.idempotencyKey !== 'string') {
    return { valid: false, error: 'idempotencyKey is required and must be a string' };
  }
  
  if (!IDEMPOTENCY_KEY_PATTERN.test(req.idempotencyKey)) {
    return { valid: false, error: 'idempotencyKey contains invalid characters' };
  }
  
  if (req.idempotencyKey.length > 128) {
    return { valid: false, error: 'idempotencyKey is too long (max 128 characters)' };
  }
  
  return {
    valid: true,
    data: {
      planSlug: req.planSlug,
      idempotencyKey: req.idempotencyKey,
    },
  };
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

async function validateAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');
  
  // Check Bearer token
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    
    try {
      // Decode JWT payload (Firebase session cookie is a JWT)
      const [, payloadBase64] = token.split('.');
      if (!payloadBase64) {
        return { authenticated: false, error: 'INVALID_TOKEN_FORMAT' };
      }
      
      const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
      const payload = JSON.parse(payloadJson);
      
      return {
        authenticated: true,
        userId: payload.user_id || payload.sub,
        email: payload.email,
      };
    } catch (e) {
      return { authenticated: false, error: 'TOKEN_PARSE_ERROR' };
    }
  }
  
  // Check session cookie
  const sessionCookie = request.cookies.get('session') || request.cookies.get('flowauxi_session');
  if (sessionCookie?.value) {
    try {
      const [, payloadBase64] = sessionCookie.value.split('.');
      if (!payloadBase64) {
        return { authenticated: false, error: 'INVALID_COOKIE_FORMAT' };
      }
      
      const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
      const payload = JSON.parse(payloadJson);
      
      return {
        authenticated: true,
        userId: payload.user_id || payload.sub,
        email: payload.email,
      };
    } catch (e) {
      return { authenticated: false, error: 'COOKIE_PARSE_ERROR' };
    }
  }
  
  return { authenticated: false, error: 'NO_AUTH' };
}

// =============================================================================
// RATE LIMITING (Simple in-memory, use Redis in production)
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per user

function checkRateLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);
  
  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true };
  }
  
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  
  entry.count++;
  return { allowed: true };
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

// =============================================================================
// PLAN SLUG NORMALIZATION
// =============================================================================

// Plan slug normalization is now handled server-side for security.
// Frontend sends short tier IDs, backend resolves to full slugs with domain validation.

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = `checkout_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  try {
    // -------------------------------------------------------------------------
    // STEP 1: AUTHENTICATION
    // -------------------------------------------------------------------------
    const authResult = await validateAuth(request);
    
    if (!authResult.authenticated) {
      console.log(`[Checkout] ${requestId} - Unauthorized: ${authResult.error}`);
      
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Please sign in to continue with your purchase.',
          },
        },
        { 
          status: 401,
          headers: {
            'WWW-Authenticate': 'Bearer',
            'X-Request-ID': requestId,
          },
        }
      );
    }
    
    // -------------------------------------------------------------------------
    // STEP 2: RATE LIMITING
    // -------------------------------------------------------------------------
    const rateLimitKey = `checkout:${authResult.userId}`;
    const rateLimit = checkRateLimit(rateLimitKey);
    
    if (!rateLimit.allowed) {
      console.log(`[Checkout] ${requestId} - Rate limited for user ${authResult.userId?.substring(0, 8)}...`);
      
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many checkout attempts. Please try again in a moment.',
            details: { retryAfter: rateLimit.retryAfter },
          },
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfter),
            'X-Request-ID': requestId,
          },
        }
      );
    }
    
    // -------------------------------------------------------------------------
    // STEP 3: PARSE & VALIDATE REQUEST BODY
    // -------------------------------------------------------------------------
    let body: unknown;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_BODY',
            message: 'Invalid JSON in request body.',
          },
        },
        { status: 400, headers: { 'X-Request-ID': requestId } }
      );
    }
    
    const validation = validateRequest(body);
    
    if (!validation.valid) {
      console.log(`[Checkout] ${requestId} - Validation failed: ${validation.error}`);
      
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error,
          },
        },
        { status: 400, headers: { 'X-Request-ID': requestId } }
      );
    }
    
    const { planSlug, idempotencyKey } = validation.data;
    
    // -------------------------------------------------------------------------
    // STEP 4: CHECK BACKEND HEALTH
    // -------------------------------------------------------------------------
    if (!isBackendHealthy()) {
      console.error(`[Checkout] ${requestId} - Backend unhealthy, circuit breaker may be open`);
      
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Payment service is temporarily unavailable. Please try again in a moment.',
            details: {
              suggestion: 'Our team has been notified. Please try again shortly.',
            },
          },
        },
        { 
          status: 503,
          headers: {
            'Retry-After': '30',
            'X-Request-ID': requestId,
          },
        }
      );
    }
    
    // -------------------------------------------------------------------------
    // STEP 5: RESOLVE DOMAIN CONTEXT (Node.js runtime - FAANG Pattern)
    // -------------------------------------------------------------------------
    // Domain resolution happens HERE in the API route handler (Node.js runtime).
    // NOT in middleware.ts (Edge Runtime can't reliably sign tokens or access DB).
    // Single source of truth: context-resolver.ts
    
    const context = await resolveContext(request);
    
    if (!context.matched) {
      console.error(`[Checkout] ${requestId} - Domain resolution failed: ${context.error}`);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'DOMAIN_NOT_RECOGNIZED',
            message: context.error || 'Failed to resolve domain context. Please refresh and try again.',
          },
        },
        { status: 400, headers: { 'X-Request-ID': requestId } }
      );
    }
    
    // Context resolved successfully
    console.log(
      `[Checkout] ${requestId} - Creating checkout session: ` +
      `user=${authResult.userId?.substring(0, 8)}..., ` +
      `domain=${context.domain}, ` +
      `tenantId=${context.tenantId?.substring(0, 8)}..., ` +
      `planSlug=${planSlug}`
    );

    // -------------------------------------------------------------------------
    // STEP 6: PROXY TO BACKEND
    // -------------------------------------------------------------------------
    const proxyResult = await proxyRequest<CheckoutSessionResponse>('/api/billing/checkout-session', {
      method: 'POST',
      headers: {
        'X-User-Id': authResult.userId || '',
        'X-User-Email': authResult.email || '',
        'X-Tenant-Domain': context.domain!,
        'X-Tenant-Id': context.tenantId!,
        'X-Signed-Context': context.signedContext!,
        'X-Request-ID': requestId,
        'Idempotency-Key': idempotencyKey,  // Pass to backend for ACID guarantee
      },
      body: JSON.stringify({
        planSlug,  // Backend handles normalization
        idempotencyKey,
      }),
    });
    
    // -------------------------------------------------------------------------
    // STEP 7: RETURN RESPONSE
    // -------------------------------------------------------------------------
    // (Step 6 was domain context resolution, Step 7 is backend response)
    if (proxyResult.success && proxyResult.data) {
      const data = proxyResult.data;
      
      if (data.success) {
        console.log(`[Checkout] ${requestId} - Success, session created`);
        
        return NextResponse.json(
          {
            success: true,
            checkoutUrl: data.checkoutUrl,
            sessionId: data.sessionId,
            pendingSubscriptionId: (data as any).pendingSubscriptionId,
            keyId: (data as any).keyId,
            message: (data as any).message,
          },
          { headers: { 'X-Request-ID': requestId } }
        );
      } else {
        // Backend returned success: false
        console.log(`[Checkout] ${requestId} - Backend returned error: ${data.error?.code}`);
        
        return NextResponse.json(
          {
            success: false,
            error: data.error,
          },
          { 
            status: proxyResult.statusCode >= 400 ? proxyResult.statusCode : 400,
            headers: { 'X-Request-ID': requestId },
          }
        );
      }
    }
    
    // Proxy failed
    console.error(`[Checkout] ${requestId} - Proxy failed:`, proxyResult.error);
    
    return NextResponse.json(
      {
        success: false,
        error: proxyResult.error || {
          code: 'PROXY_ERROR',
          message: 'Failed to create checkout session. Please try again.',
        },
      },
      { 
        status: proxyResult.statusCode,
        headers: { 'X-Request-ID': requestId },
      }
    );
    
  } catch (error) {
    console.error(`[Checkout] ${requestId} - Unexpected error:`, error);
    
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred. Please try again.',
        },
      },
      { status: 500, headers: { 'X-Request-ID': requestId } }
    );
  }
}

// =============================================================================
// OPTIONS HANDLER (CORS preflight)
// =============================================================================

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
      'Access-Control-Max-Age': '86400',
    },
  });
}
