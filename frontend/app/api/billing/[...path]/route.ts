import { NextRequest, NextResponse } from "next/server";
import { proxyRequest } from "@/lib/api/proxy-client";
import { cb, configureCircuitBreakerFromFlags } from "@/lib/api/server-circuit-breaker";
import { resolveContext } from "@/lib/api/context-resolver";
import { domainResolver } from "@/lib/domain/resolver";
import { getCachedRuntimeFlags, getRuntimeFlags } from "@/lib/billing/runtime-flags";
import {
  attachBillingBehaviorCookie,
  resolveBillingBehavior,
} from "@/lib/billing/billing-behavior";

// =============================================================================
// AUTH
// =============================================================================

function validateAuth(request: NextRequest): { authenticated: boolean; userId?: string; error?: string } {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { authenticated: false, error: "NO_AUTH" };
  }
  return { authenticated: true, error: undefined };
}

function extractUidFromBearer(request: NextRequest): string | undefined {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return undefined;
  try {
    const token = authHeader.substring(7);
    const [, payloadBase64] = token.split(".");
    if (!payloadBase64) return undefined;
    const payload = JSON.parse(Buffer.from(payloadBase64, "base64").toString("utf-8"));
    return payload.sub || payload.user_id;
  } catch {
    return undefined;
  }
}

// =============================================================================
// PATH MAP — frontend kebab-case slugs → Flask backend endpoints
// =============================================================================

const PATH_MAP: Record<string, string> = {
  "create-subscription": "/api/billing/create-subscription",
  "cancel-subscription": "/api/billing/cancel-subscription",
  "change-plan": "/api/billing/change-plan",
  "cancel-change": "/api/billing/cancel-change",
  "pending-change": "/api/billing/pending-change",
  "verify-subscription": "/api/billing/verify-subscription",
  checkout: "/api/billing/checkout",
  "verify-payment": "/api/billing/verify-payment",
  "verify-proration": "/api/billing/verify-proration",
};

// =============================================================================
// HANDLER
// =============================================================================

async function handleRequest(
  request: NextRequest,
  params: Promise<{ path: string[] }>,
  method: "GET" | "POST",
): Promise<NextResponse> {
  const { path } = await params;
  const requestId = `billing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const slug = path[0] || "";
  const fullPath = path.join("/");
  const isCreateSubscription = slug === "create-subscription" && method === "POST";

  const auth = validateAuth(request);
  if (!auth.authenticated) {
    return NextResponse.json(
      { success: false, code: "UNAUTHORIZED", message: "Please sign in to continue.", requestId },
      { status: 401, headers: { "X-Request-ID": requestId } },
    );
  }

  // Use cached flags for hot checkout path; other routes refresh from Flask.
  const flags = isCreateSubscription ? getCachedRuntimeFlags() : await getRuntimeFlags();
  configureCircuitBreakerFromFlags(flags);

  if (cb.isOpen()) {
    return NextResponse.json(
      {
        success: false,
        code: "SERVICE_UNAVAILABLE",
        message: "Service temporarily unavailable. Please try again in a moment.",
        requestId,
      },
      { status: 503, headers: { "X-Request-ID": requestId, "Retry-After": "15" } },
    );
  }

  const uid = extractUidFromBearer(request);
  const behavior = resolveBillingBehavior(request, flags, uid);

  let signedContext: string | undefined;
  let productDomain: string | undefined;

  // create-subscription only needs Host → domain (backend verifies Firebase token).
  // Skip resolveContext() here — it calls Firebase Admin session verify and adds seconds.
  if (isCreateSubscription || slug === "checkout-status") {
    const resolution = domainResolver.resolve(request);
    if (isCreateSubscription && (!resolution.matched || !resolution.context?.domain)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_CONTEXT",
          message: resolution.error || "Could not resolve product domain.",
          requestId,
        },
        { status: 400, headers: { "X-Request-ID": requestId } },
      );
    }
    productDomain = resolution.context?.domain || undefined;
  } else {
    const needsSignedContext = slug === "verify-subscription";
    if (needsSignedContext || (flags.fix_domain_context !== false && behavior.domainFix)) {
      const context = await resolveContext(request);
      if (needsSignedContext && (!context.matched || !context.signedContext || !context.domain)) {
        console.error(`[BillingProxy] ${requestId} domain resolution failed: ${context.error}`);
        return NextResponse.json(
          {
            success: false,
            code: "INVALID_CONTEXT",
            message: context.error || "Could not resolve product domain.",
            requestId,
          },
          { status: 400, headers: { "X-Request-ID": requestId } },
        );
      }
      signedContext = context.signedContext;
      productDomain = context.domain;
    }
  }

  const body = method === "POST" ? await request.json().catch(() => null) : null;
  const forwardedAuth = request.headers.get("Authorization") || request.headers.get("authorization") || "";
  const forwardedIdempotencyKey = request.headers.get("Idempotency-Key");
  const forwardedUserId = extractUidFromBearer(request);

  const backendPath = PATH_MAP[slug] || `/api/billing/${fullPath}`;

  const defaultTimeout = Number(flags.billing_timeout_ms ?? 20000);
  let proxyTimeoutMs = defaultTimeout;
  if (isCreateSubscription) {
    proxyTimeoutMs = 45000;
  } else if (fullPath.startsWith("checkout-status/") && method === "GET") {
    proxyTimeoutMs = 10000;
  }

  const proxyResult = await proxyRequest<any>(backendPath, {
    method,
    timeoutMs: proxyTimeoutMs,
    headers: {
      Authorization: forwardedAuth,
      "X-Request-Id": requestId,
      "Content-Type": "application/json",
      "X-Product-Domain": productDomain || "",
      "X-Tenant-Domain": productDomain || "",
      ...(forwardedUserId ? { "X-User-Id": forwardedUserId } : {}),
      ...(signedContext ? { "X-Signed-Context": signedContext } : {}),
      ...(forwardedIdempotencyKey ? { "Idempotency-Key": forwardedIdempotencyKey } : {}),
      "X-Billing-Canary-Cohort": behavior.canary ? "true" : "false",
      "X-Billing-Domain-Fix-Cohort": behavior.domainFix ? "true" : "false",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (proxyResult.success) {
    cb.recordSuccess();
    const response = NextResponse.json(proxyResult.data!, {
      status: proxyResult.statusCode,
      headers: { "X-Request-ID": requestId },
    });
    return attachBillingBehaviorCookie(response, behavior);
  }

  if (proxyResult.statusCode >= 500) {
    cb.recordFailure(proxyResult.statusCode);
  }

  const errorResponse = NextResponse.json(
    proxyResult.error || { success: false, code: "PROXY_ERROR", message: "Request failed.", requestId },
    { status: proxyResult.statusCode || 502, headers: { "X-Request-ID": requestId } },
  );
  return attachBillingBehaviorCookie(errorResponse, behavior);
}

// =============================================================================
// EXPORTED ROUTES
// =============================================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  try {
    return await handleRequest(request, params, "POST");
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        code: "INTERNAL_ERROR",
        message: "Unexpected error.",
        requestId: `billing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  try {
    return await handleRequest(request, params, "GET");
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        code: "INTERNAL_ERROR",
        message: "Unexpected error.",
        requestId: `billing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      },
      { status: 500 },
    );
  }
}
