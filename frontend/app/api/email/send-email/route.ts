import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/resend";
import { generateEmailHtml } from "@/lib/email/email-templates";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";

/**
 * POST /api/email/send-email
 *
 * Send email to one or more recipients
 * Requires admin authentication
 */
export async function POST(request: NextRequest) {
  try {
    // Get Firebase UID from headers (set by authentication middleware or client)
    const firebaseUID = request.headers.get("firebase-uid");

    if (!firebaseUID) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user is admin
    const user = await getUserByFirebaseUID(firebaseUID);
    if (!user || user.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { to, subject, html, templateName, templateData } = body;

    if (!to || !subject) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: to, subject" },
        { status: 400 }
      );
    }

    // Generate HTML from template if provided
    let emailHtml = html;
    if (templateName && templateData) {
      const generatedHtml = generateEmailHtml(templateName, templateData);
      if (generatedHtml) {
        emailHtml = generatedHtml;
      }
    }

    if (!emailHtml) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing email content (html or templateName required)",
        },
        { status: 400 }
      );
    }

    // Send email
    const result = await sendEmail({
      to,
      subject,
      html: emailHtml,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Send email API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
