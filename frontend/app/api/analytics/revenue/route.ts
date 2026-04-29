import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Prevent Next.js from caching this route — analytics must always be fresh
export const dynamic = "force-dynamic";

const MAX_CUSTOM_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function validateCustomRange(startDate: string | null, endDate: string | null) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start || !end) {
    return "start_date and end_date must use YYYY-MM-DD.";
  }

  if (start.getTime() > end.getTime()) {
    return "start_date must be before or equal to end_date.";
  }

  const days = Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
  if (days > MAX_CUSTOM_RANGE_DAYS) {
    return "Custom revenue analytics ranges can be up to 1 year.";
  }

  return null;
}

function getErrorMessage(errorData: any, fallback: string): string {
  if (typeof errorData?.error === "string") return errorData.error;
  if (typeof errorData?.error?.message === "string") {
    return errorData.error.message;
  }
  return fallback;
}

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
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    // Validate range
    const validRanges = ["day", "week", "month", "6months", "year", "custom"];
    if (!validRanges.includes(range)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid range. Must be one of: ${validRanges.join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (range === "custom") {
      const validationError = validateCustomRange(startDate, endDate);
      if (validationError) {
        return NextResponse.json(
          { success: false, error: validationError },
          { status: 400 },
        );
      }
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
      const backendParams = new URLSearchParams({ range });
      if (range === "custom" && startDate && endDate) {
        backendParams.set("start_date", startDate);
        backendParams.set("end_date", endDate);
      }

      response = await fetch(
        `${backendUrl}/api/analytics/revenue?${backendParams.toString()}`,
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
          error: getErrorMessage(
            errorData,
            `Backend returned ${response.status}`,
          ),
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
