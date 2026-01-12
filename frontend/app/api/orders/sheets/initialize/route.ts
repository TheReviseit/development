import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Use localhost for development
const BACKEND_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:5000"
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

/**
 * Initialize Google Sheet with headers
 * Proxies to Flask backend /api/orders/sheets/initialize
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session");

    if (!sessionCookie?.value) {
      return NextResponse.json(
        { success: false, error: { message: "Unauthorized" } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const userId = body.user_id;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: { message: "user_id is required" } },
        { status: 400 }
      );
    }

    console.log(
      `📊 Calling Flask backend: ${BACKEND_URL}/api/orders/sheets/initialize`
    );

    // Call Flask backend to initialize sheet
    const response = await fetch(
      `${BACKEND_URL}/api/orders/sheets/initialize`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": userId,
        },
        body: JSON.stringify({ user_id: userId }),
      }
    );

    // Get response as text first to handle HTML error pages
    const responseText = await response.text();

    // Check if response is HTML (error page) vs JSON
    if (responseText.startsWith("<!") || responseText.startsWith("<html")) {
      console.error(
        "❌ Flask returned HTML instead of JSON. Route may not exist."
      );
      console.error("Response status:", response.status);
      return NextResponse.json(
        {
          success: false,
          error: {
            message:
              "Backend endpoint not available. Sheet will be initialized on first order.",
            code: "ENDPOINT_NOT_FOUND",
          },
        },
        { status: 503 }
      );
    }

    // Parse as JSON
    const data = JSON.parse(responseText);
    console.log("✅ Flask response:", data.success ? "success" : "failed");

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error initializing sheet:", error);
    return NextResponse.json(
      { success: false, error: { message: "Internal server error" } },
      { status: 500 }
    );
  }
}
