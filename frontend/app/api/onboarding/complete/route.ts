import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import {
  getUserByFirebaseUID,
  markOnboardingComplete,
} from "@/lib/supabase/queries";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true
    );
    const firebaseUID = decodedClaims.uid;

    // Fetch user before marking as complete to check if they already were completed
    const user = await getUserByFirebaseUID(firebaseUID);
    
    // The database trigger might have already set onboarding_completed_at during payment webhook
    const onboardingCompletedAt = user?.onboarding_completed_at ? new Date(user.onboarding_completed_at) : null;
    const isRecentlyCompleted = onboardingCompletedAt && (Date.now() - onboardingCompletedAt.getTime() < 5 * 60 * 1000);
    const wasAlreadyCompleted = user?.onboarding_completed_at != null && !isRecentlyCompleted;

    // Check if we already sent the email in this session to prevent duplicates on reload
    const emailAlreadySentCookie = cookieStore.get("welcome_email_sent")?.value === "true";

    // Mark onboarding as complete (idempotent)
    await markOnboardingComplete(firebaseUID);

    let emailSent = false;
    // Send welcome email if onboarding was just completed and user has an email
    if (!wasAlreadyCompleted && user?.email && !emailAlreadySentCookie) {
      const { sendWelcomeEmail } = await import("@/lib/email/automated-emails");
      // Background the email sending so it doesn't block the API response
      sendWelcomeEmail(user.email, user.full_name || "there").catch(err => {
        console.error("[sendWelcomeEmail] Failed to send welcome email:", err);
      });
      emailSent = true;
    }

    const response = NextResponse.json({ success: true });
    if (emailSent) {
      // Set cookie to prevent duplicate emails on page reload (expires in 1 day)
      response.cookies.set("welcome_email_sent", "true", { maxAge: 60 * 60 * 24, httpOnly: true });
    }
    return response;
  } catch (error: any) {
    console.error("Error completing onboarding:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
