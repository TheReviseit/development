/**
 * Next.js API Route - OTP API Proxy
 * Proxies /v1/otp/* requests to backend
 *
 * Routes handled: /v1/otp/send, /v1/otp/verify, /v1/otp/resend, /v1/otp/status/*
 *
 * This proxy forwards API key authentication to the backend.
 * No cookies needed - uses Bearer token auth.
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

export async function GET(request: NextRequest) {
  return proxyRequest(request, "GET");
}

export async function POST(request: NextRequest) {
  return proxyRequest(request, "POST");
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request, "PUT");
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request, "DELETE");
}

export async function PATCH(request: NextRequest) {
  return proxyRequest(request, "PATCH");
}

async function proxyRequest(request: NextRequest, method: string) {
  try {
    // Get the path after /api - maps directly to backend
    const url = new URL(request.url);
    // /api/v1/otp/send -> /v1/otp/send
    const backendPath = url.pathname.replace("/api/v1", "/v1");
    const backendUrl = `${BACKEND_URL}${backendPath}${url.search}`;

    console.log(`[OTP API Proxy] ${method} ${backendPath}`);

    // Build headers - forward Authorization and Content-Type
    const headers: Record<string, string> = {};

    // Forward Authorization header (API key)
    const authHeader = request.headers.get("authorization");
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    // Forward Content-Type
    const contentType = request.headers.get("content-type");
    if (contentType) {
      headers["Content-Type"] = contentType;
    }

    // Forward X-Idempotency-Key if present
    const idempotencyKey = request.headers.get("x-idempotency-key");
    if (idempotencyKey) {
      headers["X-Idempotency-Key"] = idempotencyKey;
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method,
      headers,
      cache: "no-store",
    };

    // Add body for POST/PUT/PATCH
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      try {
        const body = await request.json();
        fetchOptions.body = JSON.stringify(body);
      } catch {
        // No body or invalid JSON - that's OK for some endpoints
      }
    }

    // Make request to backend
    const response = await fetch(backendUrl, fetchOptions);

    console.log(`[OTP API Proxy] Backend response: ${response.status}`);

    // Parse response
    let data;
    const responseContentType = response.headers.get("content-type");
    if (
      responseContentType &&
      responseContentType.includes("application/json")
    ) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { success: false, error: "INVALID_RESPONSE", raw: text };
      }
    }

    // Create response
    const nextResponse = NextResponse.json(data, { status: response.status });

    // Add CORS headers for API access
    nextResponse.headers.set("Access-Control-Allow-Origin", "*");
    nextResponse.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    );
    nextResponse.headers.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, X-Idempotency-Key",
    );
    nextResponse.headers.set(
      "Cache-Control",
      "no-cache, no-store, must-revalidate",
    );

    return nextResponse;
  } catch (error) {
    console.error("[OTP API Proxy] Error:", error);
    return NextResponse.json(
      { success: false, error: "PROXY_ERROR", message: String(error) },
      { status: 500 },
    );
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, X-Idempotency-Key",
      "Access-Control-Max-Age": "86400",
    },
  });
}
