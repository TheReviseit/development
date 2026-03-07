import { NextRequest, NextResponse } from "next/server";

/**
 * Monitoring API Proxy
 *
 * Proxies admin monitoring requests to the Flask backend.
 * The admin key is passed through from the client — the backend
 * validates it against MONITOR_ADMIN_KEY.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const adminKey = request.headers.get("X-Monitor-Key") || "";

    if (!adminKey) {
      return NextResponse.json(
        { success: false, error: "Admin key required" },
        { status: 401 },
      );
    }

    // Forward all query params to backend
    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

    // Determine which sub-endpoint to call based on ?endpoint= param
    const endpoint = searchParams.get("endpoint") || "";
    const validEndpoints = ["", "overview", "tenants", "trends", "models", "top"];
    if (!validEndpoints.includes(endpoint)) {
      return NextResponse.json(
        { success: false, error: "Invalid endpoint" },
        { status: 400 },
      );
    }

    const path = endpoint ? `/api/monitor/ai/${endpoint}` : "/api/monitor/ai";

    // Build query string excluding 'endpoint'
    const forwardParams = new URLSearchParams();
    searchParams.forEach((value, key) => {
      if (key !== "endpoint") {
        forwardParams.set(key, value);
      }
    });
    const qs = forwardParams.toString();
    const fullUrl = `${backendUrl}${path}${qs ? `?${qs}` : ""}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(fullUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Monitor-Key": adminKey,
        },
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeout);
      return NextResponse.json(
        { success: false, error: "Monitoring service unavailable" },
        { status: 503 },
      );
    }
    clearTimeout(timeout);

    const data = await response.json();
    return NextResponse.json(data, {
      status: response.status,
      headers: {
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    console.error("Monitor proxy error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
