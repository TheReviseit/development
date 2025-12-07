import { NextRequest, NextResponse } from "next/server";
import { sendBatchEmails } from "@/lib/email/resend";
import { generateEmailHtml } from "@/lib/email/email-templates";
import {
  getUserByFirebaseUID,
  getAllActiveUsers,
  getUsersByFilter,
} from "@/lib/supabase/queries";
import type { BulkEmailRequest, BulkEmailResponse } from "@/lib/email/types";

/**
 * POST /api/email/send-bulk
 *
 * Send bulk emails to multiple users
 * Requires admin authentication
 */
export async function POST(request: NextRequest) {
  try {
    // Get Firebase UID from headers
    const firebaseUID = request.headers.get("firebase-uid");

    if (!firebaseUID) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if user is admin
    const adminUser = await getUserByFirebaseUID(firebaseUID);
    if (!adminUser || adminUser.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    // Parse request body
    const body: BulkEmailRequest = await request.json();
    const {
      subject,
      message,
      templateName = "custom",
      filters,
      testMode = false,
    } = body;

    if (!subject || !message) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: subject, message" },
        { status: 400 }
      );
    }

    // Get recipients based on filters
    let recipients;
    if (filters && Object.keys(filters).length > 0) {
      recipients = await getUsersByFilter({
        role: filters.role,
        onboardingCompleted: filters.onboardingCompleted,
      });
    } else {
      recipients = await getAllActiveUsers();
    }

    // If test mode, only send to the admin
    if (testMode) {
      recipients = [adminUser];
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { success: false, error: "No recipients found matching criteria" },
        { status: 400 }
      );
    }

    // Generate email HTML from template
    const emails = recipients.map((recipient) => {
      const emailHtml = generateEmailHtml(templateName, {
        userName: recipient.full_name,
        userEmail: recipient.email,
        message,
      });

      return {
        to: recipient.email,
        subject,
        html: emailHtml || message,
      };
    });

    // Send batch emails
    const result = await sendBatchEmails(emails, 100); // 100ms delay between emails

    const successCount = result.results.filter((r) => r.success).length;
    const failedCount = result.results.filter((r) => !r.success).length;
    const errors = result.results
      .filter((r) => !r.success)
      .map((r) => ({
        email: r.email,
        error: r.error || "Unknown error",
      }));

    const response: BulkEmailResponse = {
      success: result.success,
      sentCount: successCount,
      failedCount,
      errors: errors.length > 0 ? errors : undefined,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("Bulk email API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal server error",
        sentCount: 0,
        failedCount: 0,
      },
      { status: 500 }
    );
  }
}
