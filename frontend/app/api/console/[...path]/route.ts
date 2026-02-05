/**
 * Next.js API Route - Console API Proxy
 * Proxies console API requests to backend
 *
 * Routes handled: /api/console/dashboard/*, /api/console/projects/*, etc.
 * (excludes /api/console/auth/* which has its own route)
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

    // Debug logging
    console.log(`[Console API Proxy] ${method} ${pathAfterConsole}`);
    console.log(
      `[Console API Proxy] Cookie header present: ${cookieHeader.length > 0}`,
    );
    if (cookieHeader) {
      // Log first 50 chars only, mask the rest for security
      const preview = cookieHeader.substring(0, 50);
      console.log(`[Console API Proxy] Cookie preview: ${preview}...`);
    }

    // Build headers - match the working auth proxy exactly
    const headers: Record<string, string> = {
      Cookie: cookieHeader,
      "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
    };

    // Add Content-Type for requests with body
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      headers["Content-Type"] = "application/json";
    }

    // Build fetch options
    const fetchOptions: RequestInit = {
      method,
      headers,
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

    // Create response
    const nextResponse = NextResponse.json(data, { status: response.status });

    // Forward Set-Cookie headers from backend (if any)
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      nextResponse.headers.append("Set-Cookie", setCookie);
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
