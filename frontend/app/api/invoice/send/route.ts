import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/resend";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { createClient } from "@supabase/supabase-js";

// Supabase client for order updates
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Helper to get user ID from Firebase session
async function getUserId(request: NextRequest): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return null;
    }

    const decodedToken = await adminAuth.verifySessionCookie(
      sessionCookie,
      true,
    );
    return decodedToken.uid;
  } catch (error) {
    console.error("Error verifying session:", error);
    return null;
  }
}

/**
 * POST /api/invoice/send
 *
 * Send an invoice email to a customer
 *
 * Body:
 * - to: string (email address)
 * - subject: string
 * - html: string (invoice HTML content)
 * - orderId: string (optional, to track invoice sent)
 *
 * Returns:
 * - success: boolean
 * - error?: string
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { to, subject, html, orderId } = body;

    // Validate required fields
    if (!to || !subject || !html) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: to, subject, html" },
        { status: 400 },
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return NextResponse.json(
        { success: false, error: "Invalid email address" },
        { status: 400 },
      );
    }

    console.log(`📧 Sending invoice to ${to} for order ${orderId || "N/A"}`);

    // Send email using Resend
    const result = await sendEmail({
      to,
      subject,
      html,
    });

    if (!result.success) {
      console.error("❌ Failed to send invoice email:", result.error);
      return NextResponse.json(
        { success: false, error: result.error || "Failed to send email" },
        { status: 500 },
      );
    }

    console.log(`✅ Invoice sent successfully to ${to}`);

    // Optionally update order with invoice_sent timestamp
    if (orderId) {
      try {
        const supabase = getSupabase();
        await supabase
          .from("orders")
          .update({
            invoice_sent_at: new Date().toISOString(),
            invoice_email: to,
          })
          .eq("id", orderId)
          .eq("user_id", userId);
      } catch (updateError) {
        // Log but don't fail the request
        console.error(
          "Warning: Failed to update order with invoice info:",
          updateError,
        );
      }
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (error) {
    console.error("Error in POST /api/invoice/send:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
