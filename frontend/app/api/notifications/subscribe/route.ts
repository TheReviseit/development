import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticatedRequest } from "@/lib/auth/verify-request";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/notifications/subscribe
 * Subscribe a device to push notifications by storing FCM token
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { user } = await verifyAuthenticatedRequest(request);

    const body = await request.json();
    const { token, deviceInfo } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "FCM token is required" },
        { status: 400 }
      );
    }

    // Upsert the push subscription (update if token exists, insert if not)
    const { error } = await supabaseAdmin.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        fcm_token: token,
        device_info: deviceInfo || {},
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "fcm_token",
        ignoreDuplicates: false,
      }
    );

    if (error) {
      console.error("Failed to save push subscription:", error);
      return NextResponse.json(
        { success: false, error: "Failed to save subscription" },
        { status: 500 }
      );
    }

    console.log(`✅ Push subscription saved for user ${user.id}`);

    return NextResponse.json({
      success: true,
      message: "Successfully subscribed to push notifications",
    });
  } catch (error) {
    console.error("Push subscription error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notifications/subscribe
 * Unsubscribe a device from push notifications
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { success: false, error: "FCM token is required" },
        { status: 400 }
      );
    }

    // Delete the subscription
    const { error } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("fcm_token", token);

    if (error) {
      console.error("Failed to delete push subscription:", error);
      return NextResponse.json(
        { success: false, error: "Failed to unsubscribe" },
        { status: 500 }
      );
    }

    console.log("✅ Push subscription removed");

    return NextResponse.json({
      success: true,
      message: "Successfully unsubscribed from push notifications",
    });
  } catch (error) {
    console.error("Push unsubscribe error:", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
