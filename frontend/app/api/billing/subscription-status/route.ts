/**
 * Billing Subscription Status (Domain-Scoped) API Route
 * =====================================================
 * Proxies to backend /api/billing/subscription-status with signed context.
 *
 * Used by /payment/status polling to avoid legacy, non-domain-scoped endpoints.
 */

import { NextRequest, NextResponse } from "next/server";
import { proxyRequest, isBackendHealthy } from "@/lib/api/proxy-client";
import { resolveContext } from "@/lib/api/context-resolver";

interface AuthResult {
  authenticated: boolean;
  userId?: string;
  email?: string;
  error?: string;
}

async function validateAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    try {
      const [, payloadBase64] = token.split(".");
      if (!payloadBase64) return { authenticated: false, error: "INVALID_TOKEN_FORMAT" };
      const payloadJson = Buffer.from(payloadBase64, "base64").toString("utf-8");
      const payload = JSON.parse(payloadJson);
      return {
        authenticated: true,
        userId: payload.user_id || payload.sub,
        email: payload.email,
      };
    } catch {
      return { authenticated: false, error: "TOKEN_PARSE_ERROR" };
    }
  }

  const sessionCookie = request.cookies.get("session") || request.cookies.get("flowauxi_session");
  if (sessionCookie?.value) {
    try {
      const [, payloadBase64] = sessionCookie.value.split(".");
      if (!payloadBase64) return { authenticated: false, error: "INVALID_COOKIE_FORMAT" };
      const payloadJson = Buffer.from(payloadBase64, "base64").toString("utf-8");
      const payload = JSON.parse(payloadJson);
      return {
        authenticated: true,
        userId: payload.user_id || payload.sub,
        email: payload.email,
      };
    } catch {
      return { authenticated: false, error: "COOKIE_PARSE_ERROR" };
    }
  }

  return { authenticated: false, error: "NO_AUTH" };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get("X-Request-Id") || `sub_status_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    const auth = await validateAuth(request);
    if (!auth.authenticated || !auth.userId) {
      return NextResponse.json(
        { success: false, code: "UNAUTHORIZED", message: "Please sign in to continue.", requestId },
        { status: 401, headers: { "X-Request-ID": requestId } },
      );
    }

    if (!isBackendHealthy()) {
      return NextResponse.json(
        { success: false, code: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable.", requestId },
        { status: 503, headers: { "X-Request-ID": requestId, "Retry-After": "5" } },
      );
    }

    const context = await resolveContext(request);
    if (!context.matched) {
      return NextResponse.json(
        { success: false, code: "DOMAIN_NOT_RECOGNIZED", message: context.error || "Failed to resolve tenant context.", requestId },
        { status: 400, headers: { "X-Request-ID": requestId } },
      );
    }

    const proxyResult = await proxyRequest<any>("/api/billing/subscription-status", {
      method: "GET",
      headers: {
        "X-User-Id": auth.userId,
        "X-User-Email": auth.email || "",
        "X-Tenant-Domain": context.domain || "",
        "X-Tenant-Id": context.tenantId || "",
        "X-Signed-Context": context.signedContext || "",
        "X-Request-Id": requestId,
      },
    });

    if (proxyResult.success && proxyResult.data) {
      return NextResponse.json(proxyResult.data, {
        status: proxyResult.statusCode || 200,
        headers: { "X-Request-ID": requestId },
      });
    }

    return NextResponse.json(
      proxyResult.error || { success: false, code: "PROXY_ERROR", message: "Failed to fetch subscription status.", requestId },
      { status: proxyResult.statusCode || 502, headers: { "X-Request-ID": requestId } },
    );
  } catch {
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", message: "Unexpected error.", requestId },
      { status: 500, headers: { "X-Request-ID": requestId } },
    );
  }
}

