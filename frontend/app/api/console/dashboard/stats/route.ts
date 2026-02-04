/**
 * Next.js API Route - Console Dashboard Stats
 * Direct proxy for dashboard stats endpoint
 */

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000";

export async function GET(request: NextRequest) {
  try {
    // Get cookies directly from request
    const cookieHeader = request.headers.get("cookie") || "";

    console.log(`[Dashboard Stats] Cookie present: ${cookieHeader.length > 0}`);

    // Also try to get the specific console cookie
    const consoleCookie = request.cookies.get("otp_console_session");
    console.log(
      `[Dashboard Stats] Console cookie obj: ${JSON.stringify(consoleCookie)}`,
    );

    // Build the full cookie string if we have the specific cookie
    let finalCookie = cookieHeader;
    if (consoleCookie && !cookieHeader.includes("otp_console_session")) {
      finalCookie = `otp_console_session=${consoleCookie.value}`;
    }

    console.log(
      `[Dashboard Stats] Final cookie (first 80 chars): ${finalCookie.substring(0, 80)}`,
    );

    const response = await fetch(`${BACKEND_URL}/console/dashboard/stats`, {
      method: "GET",
      headers: {
        Cookie: finalCookie,
        "X-Forwarded-For": request.headers.get("x-forwarded-for") || "",
      },
    });

    console.log(`[Dashboard Stats] Backend response: ${response.status}`);

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[Dashboard Stats] Error:", error);
    return NextResponse.json(
      { success: false, error: "PROXY_ERROR", message: String(error) },
      { status: 500 },
    );
  }
}
