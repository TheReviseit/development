import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticatedRequest } from "@/lib/auth/verify-request";

/**
 * POST /api/test-push
 * Test endpoint to trigger a push notification for the authenticated user
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { user } = await verifyAuthenticatedRequest(request);

    // Get backend URL from environment
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

    // Call backend to send push notification
    const response = await fetch(`${backendUrl}/api/test-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-ID": user.id,
      },
      body: JSON.stringify({
        user_id: user.id,
        title: "Test Notification",
        body: "This is a test push notification from ReviseIt",
        data: {
          type: "test",
          timestamp: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      throw new Error("Backend push test failed");
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: "Test push notification sent",
      data,
    });
  } catch (error) {
    console.error("Test push error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
