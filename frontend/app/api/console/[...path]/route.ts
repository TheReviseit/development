/**
 * Next.js API Route - Console API Proxy
 * Proxies console API requests to backend
 *
 * Routes handled: /api/console/dashboard/*, /api/console/projects/*, etc.
 * (excludes /api/console/auth/* which has its own route)
 *
 * AUTH STRATEGY:
 * - Access tokens are JWT with 15-minute TTL
 * - Backend handles token refresh automatically on valid refresh token
 * - If access token is expired AND refresh fails → 401 forces re-login
 * - This proxy MUST forward all Set-Cookie headers to preserve token rotation
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
    // Get the path after /api/console - maps to /console on backend
    const url = new URL(request.url);
    const pathAfterConsole = url.pathname.replace("/api/console", "/console");
    const backendUrl = `${BACKEND_URL}${pathAfterConsole}${url.search}`;

    // Get cookies from request - this is what the browser sends
    const cookieHeader = request.headers.get("cookie") || "";

    // Safe debug logging - log cookie NAMES only, not values
    const cookieNames = cookieHeader
      .split(";")
      .map((c) => c.trim().split("=")[0])
      .filter(Boolean);
    console.log(`[Console API Proxy] ${method} ${pathAfterConsole}`);
    console.log(`[Console API Proxy] Cookies received:`, cookieNames);

    // Build headers - match the working auth proxy exactly
    const headers: Record<string, string> = {
      Cookie: cookieHeader,
      "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
    };

    // Add Content-Type for requests with body
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      headers["Content-Type"] = "application/json";
    }

    // Build fetch options - CRITICAL: cache: 'no-store' prevents Next.js caching
    const fetchOptions: RequestInit = {
      method,
      headers,
      cache: "no-store", // FIX: Prevent stale auth responses
    };

    // Add body for POST/PUT/PATCH
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      try {
        const body = await request.json();
        fetchOptions.body = JSON.stringify(body);
      } catch {
        // No body or invalid JSON - that's OK
      }
    }

    // Make request to backend
    const response = await fetch(backendUrl, fetchOptions);

    console.log(`[Console API Proxy] Backend response: ${response.status}`);

    // Parse response
    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = { success: false, error: "INVALID_RESPONSE" };
      }
    }

    // Create response with proper cache control headers
    const nextResponse = NextResponse.json(data, { status: response.status });

    // FIX: Add cache control headers to prevent browser/CDN caching
    nextResponse.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, must-revalidate",
    );
    nextResponse.headers.set("Vary", "Cookie"); // Prevent caching across users

    // FIX: Forward ALL Set-Cookie headers from backend using getSetCookie()
    // This is CRITICAL for token rotation - .get('set-cookie') only returns first cookie!
    const cookies = response.headers.getSetCookie?.();
    if (cookies && cookies.length > 0) {
      const cookieNamesReceived = cookies.map((c) => c.split("=")[0]);
      console.log(
        `[Console API Proxy] Forwarding ${cookies.length} Set-Cookie headers:`,
        cookieNamesReceived,
      );
      for (const cookie of cookies) {
        nextResponse.headers.append("Set-Cookie", cookie);
      }
    } else {
      // Fallback for older fetch implementations
      const setCookieHeader = response.headers.get("set-cookie");
      if (setCookieHeader) {
        console.log(
          `[Console API Proxy] Set-Cookie (fallback):`,
          setCookieHeader.split("=")[0],
        );
        nextResponse.headers.append("Set-Cookie", setCookieHeader);
      }
    }

    return nextResponse;
  } catch (error) {
    console.error("[Console API Proxy] Error:", error);
    return NextResponse.json(
      { success: false, error: "PROXY_ERROR", message: String(error) },
      { status: 500 },
    );
  }
}
