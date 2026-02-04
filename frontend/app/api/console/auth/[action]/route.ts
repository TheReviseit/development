/**
 * Next.js API Route - Console Auth Proxy
 * Proxies auth requests to backend
 *
 * IMPORTANT: Properly handles Set-Cookie headers which contain
 * commas in date format (e.g., "Mon, 11 Feb 2026 04:41:17 GMT")
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;

  try {
    const body = await request.json().catch(() => ({}));

    // Forward cookies for requests that need them (logout, refresh)
    const cookieHeader = request.headers.get("cookie") || "";

    const response = await fetch(`${BACKEND_URL}/console/auth/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
        "X-Forwarded-For":
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip") ||
          "",
        "User-Agent": request.headers.get("user-agent") || "",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    // Create response
    const nextResponse = NextResponse.json(data, { status: response.status });

    // PROPERLY forward Set-Cookie headers from backend
    // Use getSetCookie() which returns an array - this handles cookies correctly
    // without breaking on commas in date strings
    const cookies = response.headers.getSetCookie?.();
    if (cookies && cookies.length > 0) {
      console.log(
        `[Auth Proxy] Forwarding ${cookies.length} cookies from backend`,
      );
      for (const cookie of cookies) {
        console.log(`[Auth Proxy] Set-Cookie: ${cookie.substring(0, 60)}...`);
        nextResponse.headers.append("Set-Cookie", cookie);
      }
    } else {
      // Fallback for older fetch implementations
      const setCookieHeader = response.headers.get("set-cookie");
      if (setCookieHeader) {
        console.log(
          `[Auth Proxy] Set-Cookie (raw): ${setCookieHeader.substring(0, 60)}...`,
        );
        nextResponse.headers.append("Set-Cookie", setCookieHeader);
      }
    }

    return nextResponse;
  } catch (error) {
    console.error("Auth proxy error:", error);
    return NextResponse.json(
      { success: false, error: "PROXY_ERROR" },
      { status: 500 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;

  try {
    // Forward cookies from request
    const cookieHeader = request.headers.get("cookie") || "";

    // Debug logging
    console.log(`[Auth Proxy GET] /${action}`);
    console.log(
      `[Auth Proxy GET] Cookie header: ${cookieHeader.substring(0, 80)}...`,
    );

    // Also check for the specific cookie
    const sessionCookie = request.cookies.get("otp_console_session");
    console.log(
      `[Auth Proxy GET] Session cookie obj: ${sessionCookie ? "present" : "undefined"}`,
    );

    const response = await fetch(`${BACKEND_URL}/console/auth/${action}`, {
      method: "GET",
      headers: {
        Cookie: sessionCookie
          ? `otp_console_session=${sessionCookie.value}`
          : cookieHeader,
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
      },
    });

    console.log(`[Auth Proxy GET] Backend response: ${response.status}`);

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Auth proxy error:", error);
    return NextResponse.json(
      { success: false, error: "PROXY_ERROR" },
      { status: 500 },
    );
  }
}
