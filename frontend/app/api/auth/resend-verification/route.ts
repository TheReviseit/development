import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Generate random 6-digit code
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("session");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { userId, email } = await request.json();

    if (!userId || !email) {
      return NextResponse.json(
        { error: "User ID and email are required" },
        { status: 400 }
      );
    }

    // Check for recent resend attempts (rate limiting)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { data: recentCodes } = await supabase
      .from("verification_codes")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", fiveMinutesAgo.toISOString());

    if (recentCodes && recentCodes.length >= 3) {
      return NextResponse.json(
        {
          error: "Too many requests. Please wait before requesting a new code.",
        },
        { status: 429 }
      );
    }

    // Invalidate all previous codes for this user
    await supabase
      .from("verification_codes")
      .update({ verified: true }) // Mark as verified to invalidate
      .eq("user_id", userId)
      .eq("verified", false);

    // Generate new code
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store new code
    const { error: insertError } = await supabase
      .from("verification_codes")
      .insert({
        user_id: userId,
        code: code,
        expires_at: expiresAt.toISOString(),
        verified: false,
        attempts: 0,
      });

    if (insertError) {
      console.error("Error storing verification code:", insertError);
      return NextResponse.json(
        { error: "Failed to generate verification code" },
        { status: 500 }
      );
    }

    // Send verification email
    try {
      const { sendEmail } = await import("@/lib/email/resend");
      const { generateEmailHtml } = await import("@/lib/email/email-templates");

      const emailHtml = generateEmailHtml("email-verification", { code });

      if (emailHtml) {
        const result = await sendEmail({
          to: email,
          subject: "Verify your ReviseIt account - New Code",
          html: emailHtml,
        });

        if (!result.success) {
          console.error("Failed to send verification email:", result.error);
        } else {
          console.log(`✅ New verification code sent to ${email}`);
        }
      }
    } catch (emailError) {
      console.error("Error sending verification email:", emailError);
    }

    return NextResponse.json({
      success: true,
      message: "New verification code sent to your email",
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
