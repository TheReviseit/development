import { Resend } from "resend";

// Initialize Resend client
const resendApiKey = process.env.RESEND_API_KEY;

if (!resendApiKey) {
  console.warn("RESEND_API_KEY is not set in environment variables");
}

export const resend = new Resend(resendApiKey);

// Helper function to send email with error handling
export async function sendEmail({
  to,
  subject,
  html,
  from = "ReviseIt <contact@reviseit.in>",
}: {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
}) {
  try {
    const response = await resend.emails.send({
      from,
      to,
      subject,
      html,
    });

    return {
      success: true,
      messageId: response.data?.id,
    };
  } catch (error: any) {
    console.error("Error sending email:", error);
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
  delayMs: number = 100 // Delay between emails to avoid rate limits
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
