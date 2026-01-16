import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { sendEmail } from "@/lib/email/resend";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";

/**
 * POST /api/email/test-email
 *
 * Send a test email to verify configuration
 * Requires admin authentication
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true
    );
    const firebaseUID = decodedClaims.uid;

    // Check if user is admin
    const user = await getUserByFirebaseUID(firebaseUID);
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { success: false, error: "RESEND_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // Send test email to admin
    const testHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: #f5f5f5; padding: 30px; border-radius: 8px; }
            h1 { color: #2563eb; }
            .success { background: #dcfce7; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Email Configuration Test</h1>
            <div class="success">
              <strong>Success!</strong> Your email configuration is working correctly.
            </div>
            <p>This test email was sent from <strong>noreply@flowauxi.com</strong></p>
            <p>Resend API is properly configured and functional.</p>
            <hr />
            <p style="color: #666; font-size: 12px;">
              Sent at: ${new Date().toLocaleString()}<br />
              Recipient: ${user.email}
            </p>
          </div>
        </body>
      </html>
    `;

    const result = await sendEmail({
      to: user.email,
      subject: "✅ Flowauxi Email Configuration Test",
      html: testHtml,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Test email sent successfully to ${user.email}`,
        messageId: result.messageId,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Failed to send test email",
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Test email API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
