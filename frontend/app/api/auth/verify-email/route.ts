import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { adminAuth } from "@/lib/firebase-admin";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_ATTEMPTS = 3;

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("session");

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify Firebase session and get user ID
    let userId: string;
    try {
      const decodedToken = await adminAuth.verifySessionCookie(session.value);
      userId = decodedToken.uid;
    } catch (error) {
      console.error("Session verification error:", error);
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const { code } = await request.json();

    if (!code || code.length !== 6) {
      return NextResponse.json(
        { error: "Invalid verification code format" },
        { status: 400 }
      );
    }

    // Find the verification code
    const { data: verificationData, error: fetchError } = await supabase
      .from("verification_codes")
      .select("*")
      .eq("user_id", userId)
      .eq("code", code)
      .eq("verified", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !verificationData) {
      return NextResponse.json(
        { error: "Invalid or expired verification code" },
        { status: 400 }
      );
    }

    // Check if code has expired
    const now = new Date();
    const expiresAt = new Date(verificationData.expires_at);

    if (now > expiresAt) {
      return NextResponse.json(
        { error: "Verification code has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Check max attempts
    if (verificationData.attempts >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many failed attempts. Please request a new code." },
        { status: 400 }
      );
    }

    // Mark code as verified
    const { error: updateCodeError } = await supabase
      .from("verification_codes")
      .update({ verified: true })
      .eq("id", verificationData.id);

    if (updateCodeError) {
      console.error("Error updating verification code:", updateCodeError);
      return NextResponse.json(
        { error: "Verification failed" },
        { status: 500 }
      );
    }

    // Update user's email_verified status
    const { error: updateUserError } = await supabase
      .from("users")
      .update({ email_verified: true })
      .eq("firebase_uid", userId);

    if (updateUserError) {
      console.error("Error updating user:", updateUserError);
    }

    // Send welcome email
    try {
      const { sendEmail } = await import("@/lib/email/resend");
      const { generateEmailHtml } = await import("@/lib/email/email-templates");

      // Get user data for personalization - use maybeSingle() or handle array result
      const { data: userDataArray, error: userError } = await supabase
        .from("users")
        .select("full_name, email")
        .eq("firebase_uid", userId);

      if (userError) {
        console.error("Error fetching user for welcome email:", userError);
      }

      // Check if we got user data (array should have at least one item)
      const userData =
        userDataArray && userDataArray.length > 0 ? userDataArray[0] : null;

      if (!userData) {
        console.error(
          `❌ User not found for firebase_uid: ${userId}. Cannot send welcome email.`
        );
      } else {
        const emailHtml = generateEmailHtml("welcome-verified", {
          userName: userData.full_name || "there",
        });

        if (emailHtml && userData.email) {
          const emailResult = await sendEmail({
            to: userData.email,
            subject: "Welcome to Flowauxi! 🎉",
            html: emailHtml,
          });

          if (emailResult.success) {
            console.log(`✅ Welcome email sent to ${userData.email}`);
          } else {
            console.error(
              `❌ Failed to send welcome email:`,
              emailResult.error
            );
          }
        } else {
          console.error(
            "❌ No email HTML generated or user email missing for welcome email"
          );
        }
      }
    } catch (emailError) {
      console.error("Error sending welcome email:", emailError);
      // Don't fail the verification if welcome email fails
    }

    // Clean up old verification codes for this user
    await supabase
      .from("verification_codes")
      .delete()
      .eq("user_id", userId)
      .neq("id", verificationData.id);

    return NextResponse.json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("Verify email error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
