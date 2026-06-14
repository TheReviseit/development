import { NextRequest, NextResponse } from "next/server";
import { proxyRequest, isBackendHealthy } from "@/lib/api/proxy-client";

interface AuthResult {
  authenticated: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

function validateAuth(request: NextRequest): AuthResult {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { authenticated: false, error: "NO_AUTH" };
  }
  return { authenticated: true, error: undefined };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const requestId = `billing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const auth = validateAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, code: "UNAUTHORIZED", message: "Please sign in to continue.", requestId },
        { status: 401, headers: { "X-Request-ID": requestId } },
      );
    }

    if (!isBackendHealthy()) {
      return NextResponse.json(
        { success: false, code: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable.", requestId },
        { status: 503, headers: { "X-Request-ID": requestId, "Retry-After": "30" } },
      );
    }

    const body = await request.json().catch(() => null);
    const forwardedAuth = request.headers.get("Authorization") || request.headers.get("authorization") || "";

    // ══════════════════════════════════════════════════════════════════════
    // DOMAIN CONTEXT HEADERS — Forward signed domain context to Flask
    // ══════════════════════════════════════════════════════════════════════
    // These headers are injected by proxy.ts middleware (STEP 0) and carry
    // the HMAC-signed domain context that Flask uses for:
    //   - Domain-aware pricing resolution (g.product_domain)
    //   - Tenant isolation and billing security
    // Without these, domain_middleware.py falls back to Host-based resolution
    // and resolves 127.0.0.1:5000 → "dashboard" instead of the correct domain.
    const signedContext = request.headers.get("x-signed-context");
    const tenantDomain = request.headers.get("x-tenant-domain");
    const forwardedIdempotencyKey = request.headers.get("Idempotency-Key");

    // Map frontend kebab-case slugs to Flask backend endpoints
    // Values with a leading "/" are treated as full backend paths
    const PATH_MAP: Record<string, string> = {
      "create-subscription": "/api/subscriptions/create",
      "cancel-subscription": "/api/subscriptions/cancel",
      "change-plan": "/api/subscriptions/change-plan",
      "cancel-change": "/api/subscriptions/cancel-change",
      "pending-change": "/api/subscriptions/pending-change",
      "verify-subscription": "/api/subscriptions/verify",
      "checkout": "/api/upgrade/checkout",
      "verify-payment": "/api/upgrade/verify-payment",
      "verify-proration": "/api/subscriptions/verify-proration",
    };
    const slug = path[0] || "";
    const backendPath = PATH_MAP[slug] || `/api/subscriptions/${slug}`;
    const proxyResult = await proxyRequest<any>(backendPath, {
      method: "POST",
      headers: {
        Authorization: forwardedAuth,
        "X-Request-Id": requestId,
        "Content-Type": "application/json",
        ...(signedContext ? { "X-Signed-Context": signedContext, "X-Tenant-Domain": tenantDomain || "", "X-Product-Domain": tenantDomain || "" } : {}),
        ...(forwardedIdempotencyKey ? { "Idempotency-Key": forwardedIdempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (proxyResult.success && proxyResult.data) {
      return NextResponse.json(proxyResult.data, {
        status: proxyResult.statusCode || 200,
        headers: { "X-Request-ID": requestId },
      });
    }

    return NextResponse.json(
      proxyResult.error || { success: false, code: "PROXY_ERROR", message: "Request failed.", requestId },
      { status: proxyResult.statusCode || 502, headers: { "X-Request-ID": requestId } },
    );
  } catch (e) {
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", message: "Unexpected error.", requestId },
      { status: 500, headers: { "X-Request-ID": requestId } },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await params;
  const requestId = `billing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const auth = validateAuth(request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, code: "UNAUTHORIZED", message: "Please sign in to continue.", requestId },
        { status: 401, headers: { "X-Request-ID": requestId } },
      );
    }

    if (!isBackendHealthy()) {
      return NextResponse.json(
        { success: false, code: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable.", requestId },
        { status: 503, headers: { "X-Request-ID": requestId, "Retry-After": "30" } },
      );
    }

    const forwardedAuth = request.headers.get("Authorization") || request.headers.get("authorization") || "";

    // ══════════════════════════════════════════════════════════════════════
    // DOMAIN CONTEXT HEADERS — Forward signed domain context to Flask
    // ══════════════════════════════════════════════════════════════════════
    const signedContext = request.headers.get("x-signed-context");
    const tenantDomain = request.headers.get("x-tenant-domain");

    // Map frontend kebab-case slugs to Flask backend endpoints
    // Values with a leading "/" are treated as full backend paths
    const PATH_MAP: Record<string, string> = {
      "create-subscription": "/api/subscriptions/create",
      "cancel-subscription": "/api/subscriptions/cancel",
      "change-plan": "/api/subscriptions/change-plan",
      "cancel-change": "/api/subscriptions/cancel-change",
      "pending-change": "/api/subscriptions/pending-change",
      "verify-subscription": "/api/subscriptions/verify",
      "checkout": "/api/upgrade/checkout",
      "verify-payment": "/api/upgrade/verify-payment",
      "verify-proration": "/api/subscriptions/verify-proration",
    };
    const slug = path[0] || "";
    const backendPath = PATH_MAP[slug] || `/api/subscriptions/${slug}`;

    const proxyResult = await proxyRequest<any>(backendPath, {
      method: "GET",
      headers: {
        Authorization: forwardedAuth,
        "X-Request-Id": requestId,
        ...(signedContext ? { "X-Signed-Context": signedContext, "X-Tenant-Domain": tenantDomain || "", "X-Product-Domain": tenantDomain || "" } : {}),
      },
    });

    if (proxyResult.success && proxyResult.data) {
      return NextResponse.json(proxyResult.data, {
        status: proxyResult.statusCode || 200,
        headers: { "X-Request-ID": requestId },
      });
    }

    return NextResponse.json(
      proxyResult.error || { success: false, code: "PROXY_ERROR", message: "Request failed.", requestId },
      { status: proxyResult.statusCode || 502, headers: { "X-Request-ID": requestId } },
    );
  } catch (e) {
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", message: "Unexpected error.", requestId },
      { status: 500, headers: { "X-Request-ID": requestId } },
    );
  }
}
