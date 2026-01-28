import { Resend } from "resend";

// Initialize Resend client
const resendApiKey = process.env.RESEND_API_KEY;

if (!resendApiKey) {
  console.error(
    "❌ CRITICAL: RESEND_API_KEY is not set in environment variables. Emails will NOT be sent!",
  );
}

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Helper function to send email with error handling
export async function sendEmail({
  to,
  subject,
  html,
  from = "Flowauxi Invoice <invoice@flowauxi.com>",
  attachments,
}: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  attachments?: any[];
}) {
  // Check if Resend is configured
  if (!resend) {
    console.error("❌ Cannot send email: RESEND_API_KEY is not configured");
    return {
      success: false,
      error: "Email service not configured. Please contact support.",
    };
  }

  try {
    console.log(
      `📧 Attempting to send email to ${to} with subject: "${subject}"`,
    );

    const response = await resend.emails.send({
      from,
      to,
      subject,
      html,
      attachments,
    });

    if (response.error) {
      console.error("❌ Resend API error:", response.error);
      return {
        success: false,
        error: response.error.message || "Email service error",
      };
    }

    console.log(`✅ Email sent successfully! Message ID: ${response.data?.id}`);
    return {
      success: true,
      messageId: response.data?.id,
    };
  } catch (error: any) {
    console.error("❌ Error sending email:", error);
    console.error("  Error details:", JSON.stringify(error, null, 2));
    return {
      success: false,
      error: error.message || "Failed to send email",
    };
  }
}

// Batch send emails with rate limiting
export async function sendBatchEmails(
  emails: Array<{
    to: string;
    subject: string;
    html: string;
  }>,
  delayMs: number = 100, // Delay between emails to avoid rate limits
): Promise<{
  success: boolean;
  results: Array<{ email: string; success: boolean; error?: string }>;
}> {
  const results: Array<{ email: string; success: boolean; error?: string }> =
    [];

  for (const email of emails) {
    const result = await sendEmail(email);

    results.push({
      email: email.to,
      success: result.success,
      error: result.error,
    });

    // Add delay between emails
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const successCount = results.filter((r) => r.success).length;

  return {
    success: successCount > 0,
    results,
  };
}
