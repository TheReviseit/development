import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { adminAuth } from "@/lib/firebase-admin";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_ATTEMPTS = 3;
const VERIFICATION_CODE_RE = /^\d{6}$/;

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

    const { code } = await request.json().catch(() => ({}));
    const verificationCode = typeof code === "string" ? code.trim() : "";

    if (!VERIFICATION_CODE_RE.test(verificationCode)) {
      return NextResponse.json(
        { error: "Kindly enter a valid 6-digit verification code." },
        { status: 400 }
      );
    }

    // Idempotency: if the user has already been verified, accept repeat calls.
    const { data: existingUser, error: existingUserError } = await supabase
      .from("users")
      .select("email_verified")
      .eq("firebase_uid", userId)
      .maybeSingle();

    if (existingUserError) {
      console.error("Error checking user verification state:", existingUserError);
    }

    if (existingUser?.email_verified) {
      return NextResponse.json({
        success: true,
        message: "Email is already verified",
      });
    }

    // Find the latest active verification code for this user. Fetching by user
    // first allows attempts to be tracked even when the entered code is wrong.
    const { data: verificationData, error: fetchError } = await supabase
      .from("verification_codes")
      .select("*")
      .eq("user_id", userId)
      .eq("verified", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError || !verificationData) {
      if (fetchError) {
        console.error("Error fetching verification code:", fetchError);
      }

      return NextResponse.json(
        { error: "The verification code is incorrect or expired." },
        { status: 400 }
      );
    }

    // Check if code has expired
    const now = new Date();
    const expiresAt = new Date(verificationData.expires_at);

    if (now > expiresAt) {
      await supabase
        .from("verification_codes")
        .update({ verified: true })
        .eq("id", verificationData.id)
        .eq("verified", false);

      return NextResponse.json(
        { error: "Verification code has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Check max attempts
    if (Number(verificationData.attempts ?? 0) >= MAX_ATTEMPTS) {
      return NextResponse.json(
        { error: "Too many failed attempts. Please request a new code." },
        { status: 400 }
      );
    }

    if (verificationData.code !== verificationCode) {
      const nextAttempts = Number(verificationData.attempts ?? 0) + 1;
      const shouldInvalidate = nextAttempts >= MAX_ATTEMPTS;

      await supabase
        .from("verification_codes")
        .update({
          attempts: nextAttempts,
          ...(shouldInvalidate ? { verified: true } : {}),
        })
        .eq("id", verificationData.id)
        .eq("verified", false);

      return NextResponse.json(
        {
          error: shouldInvalidate
            ? "Too many failed attempts. Please request a new code."
            : "The verification code is incorrect. Please check the code and try again.",
          attemptsRemaining: Math.max(MAX_ATTEMPTS - nextAttempts, 0),
        },
        { status: 400 }
      );
    }

    // Mark code as verified using a conditional update so duplicate or raced
    // requests cannot verify the same OTP twice.
    const { data: verifiedCode, error: updateCodeError } = await supabase
      .from("verification_codes")
      .update({ verified: true })
      .eq("id", verificationData.id)
      .eq("verified", false)
      .select("id")
      .maybeSingle();

    if (updateCodeError) {
      console.error("Error updating verification code:", updateCodeError);
      return NextResponse.json(
        { error: "Verification failed" },
        { status: 500 }
      );
    }

    if (!verifiedCode) {
      return NextResponse.json(
        { error: "This verification code has already been used." },
        { status: 409 }
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

    console.info(
      "[verify-email] Email verified; welcome email deferred until product access activation",
      { firebaseUid: userId },
    );
    // Clean up old verification codes for this user
    await supabase
      .from("verification_codes")
      .delete()
      .eq("user_id", userId)
      .neq("id", verificationData.id);

    return NextResponse.json({
      success: true,
      message: "Email verified successfully",
      welcomeEmailDeferred: true,
    });
  } catch (error) {
    console.error("Verify email error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
