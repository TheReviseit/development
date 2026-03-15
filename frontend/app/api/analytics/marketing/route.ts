import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Marketing Analytics API Proxy
 *
 * Proxies requests to Flask backend /api/analytics/marketing endpoint.
 * Returns campaign performance, messaging stats, contacts, AI usage,
 * and trends — all in one call for the marketing dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get("period") || "30d";

    const validPeriods = ["7d", "30d", "90d"];
    if (!validPeriods.includes(period)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid period. Must be one of: ${validPeriods.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");

    if (!sessionCookie) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 },
      );
    }

    // Resolve user ID via /api/me
    let userId: string | null = null;
    try {
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

    const backendUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(
        `${backendUrl}/api/analytics/marketing?period=${period}`,
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
      console.error("Backend unreachable for marketing analytics:", fetchError);
      return NextResponse.json(
        {
          success: false,
          error:
            "Analytics service is temporarily unavailable. Please try again later.",
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

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error in marketing analytics API:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
