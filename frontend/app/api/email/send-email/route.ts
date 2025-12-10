import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/resend";
import { generateEmailHtml } from "@/lib/email/email-templates";
import { verifyAdminRequest } from "@/lib/auth/verify-request";
import { sendEmailSchema } from "@/lib/validation/schemas";

/**
 * POST /api/email/send-email
 *
 * Send email to one or more recipients
 * Requires admin authentication
 *
 * SECURITY: Uses session cookie verification instead of trusting client headers
 */
export async function POST(request: NextRequest) {
  try {
    // ✅ SECURE: Verify admin access via session cookie
    const adminUser = await verifyAdminRequest(request);

    // Parse request body
    const body = await request.json();

    // ✅ SECURE: Validate input with Zod
    const validationResult = sendEmailSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { to, subject, html, templateName, templateData } =
      validationResult.data;

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
    // Handle authentication/authorization errors
    if (error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    if (error.message.includes("Forbidden")) {
      return NextResponse.json(
        { success: false, error: "Admin access required" },
        { status: 403 }
      );
    }

    // Generic error handling
    console.error("Send email API error:", error.message);
    return NextResponse.json(
      {
        success: false,
        error:
          process.env.NODE_ENV === "production"
            ? "Internal server error"
            : error.message,
      },
      { status: 500 }
    );
  }
}
