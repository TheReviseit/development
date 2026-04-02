import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Prevent Next.js from caching this route — analytics must always be fresh
export const dynamic = "force-dynamic";

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
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

    // Call Flask backend with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(
        `${backendUrl}/api/analytics/revenue?range=${range}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-User-ID": userId,
          },
          cache: "no-store",
          signal: controller.signal,
        },
      );
    } catch (fetchError) {
      clearTimeout(timeout);
      console.error("Backend unreachable for revenue analytics:", fetchError);
      return NextResponse.json(
        {
          success: false,
          error: "Analytics service is temporarily unavailable. Please try again later.",
        },
        { status: 503 },
      );
    }
    clearTimeout(timeout);

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

    // Return fresh data — never cache revenue analytics
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
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
