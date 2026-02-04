/**
 * Next.js API Route - Console Auth Proxy
 * Proxies auth requests to backend
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

    const response = await fetch(`${BACKEND_URL}/console/auth/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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

    // Forward cookies from backend
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      // Parse and forward each cookie
      const cookies = setCookie.split(",").map((c) => c.trim());
      cookies.forEach((cookie) => {
        nextResponse.headers.append("Set-Cookie", cookie);
      });
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

    const response = await fetch(`${BACKEND_URL}/console/auth/${action}`, {
      method: "GET",
      headers: {
        Cookie: cookieHeader,
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
      },
    });

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
