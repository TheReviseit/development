import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Revenue Analytics API Proxy
 *
 * Proxies requests to the Flask backend /api/analytics/revenue endpoint
 * Handles authentication by forwarding user ID from session
 */
export async function GET(request: NextRequest) {
  try {
    // Get the range parameter from the query string
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "month";

    // Validate range
    const validRanges = ["day", "week", "month", "6months", "year"];
    if (!validRanges.includes(range)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid range. Must be one of: ${validRanges.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Get user ID from session cookie
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");

    if (!sessionCookie) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Decode the session to get user ID
    // For Firebase Auth, the session token contains the user info
    let userId: string | null = null;

    try {
      // Try to get user from our /api/me endpoint
      const meUrl = new URL("/api/me", request.url);
      const meResponse = await fetch(meUrl.toString(), {
        headers: {
          cookie: request.headers.get("cookie") || "",
        },
      });

      if (meResponse.ok) {
        const meData = await meResponse.json();
        userId = meData.user?.uid || meData.user?.id;
      }
    } catch (e) {
      console.error("Failed to get user from /api/me:", e);
    }

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Could not identify user" },
        { status: 401 },
      );
    }

    // Get backend URL from environment
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

    // Call Flask backend
    const response = await fetch(
      `${backendUrl}/api/analytics/revenue?range=${range}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-User-ID": userId,
        },
        // Don't cache at the fetch level, let the hook handle caching
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Backend error" }));
      return NextResponse.json(
        {
          success: false,
          error: errorData.error || `Backend returned ${response.status}`,
        },
        { status: response.status },
      );
    }

    const data = await response.json();

    // Return the response with cache headers
    return NextResponse.json(data, {
      headers: {
        // Cache for 1 minute at the edge, but always revalidate
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error in revenue analytics API:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
