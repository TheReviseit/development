import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { sendBatchEmails } from "@/lib/email/resend";
import { generateEmailHtml } from "@/lib/email/email-templates";
import {
  getUserByFirebaseUID,
  getAllActiveUsers,
  getUsersByFilter,
} from "@/lib/supabase/queries";
import { z } from "zod";

// Input Validation Schema
const bulkEmailSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  message: z.string().min(1, "Message is required"),
  templateName: z.string().default("custom"),
  filters: z
    .object({
      role: z.string().optional(),
      onboardingCompleted: z.boolean().optional(),
    })
    .optional(),
  testMode: z.boolean().default(false),
});

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

    // Verify Session Cookie
    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true
    );
    const firebaseUID = decodedClaims.uid;

    // Check if user is admin
    const adminUser = await getUserByFirebaseUID(firebaseUID);
    // Strict admin check - relying on database role, not just claims if claims aren't custom set
    if (!adminUser || adminUser.role !== "admin") {
      return NextResponse.json(
        { success: false, error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    // Parse and Validate Body
    const json = await request.json();
    const validationResult = bulkEmailSchema.safeParse(json);

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

    const { subject, message, templateName, filters, testMode } =
      validationResult.data;

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

    if (!recipients || recipients.length === 0) {
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
    const result = await sendBatchEmails(emails, 100);

    const successCount = result.results.filter((r) => r.success).length;
    const failedCount = result.results.filter((r) => !r.success).length;
    const errors = result.results
      .filter((r) => !r.success)
      .map((r) => ({
        email: r.email,
        error: r.error || "Unknown error",
      }));

    return NextResponse.json({
      success: result.success,
      sentCount: successCount,
      failedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
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
