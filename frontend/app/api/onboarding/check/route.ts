import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";
import { getWhatsAppAccountsByUserId } from "@/lib/supabase/facebook-whatsapp-queries";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the session cookie
    const decodedClaims = await adminAuth.verifySessionCookie(
      sessionCookie,
      true,
    );
    const firebaseUID = decodedClaims.uid;

    const user = await getUserByFirebaseUID(firebaseUID);

    if (!user) {
      return NextResponse.json({
        onboardingCompleted: false,
        whatsappConnected: false,
      });
    }

    // Check if user has WhatsApp accounts connected
    let whatsappConnected = false;
    try {
      const whatsappAccounts = await getWhatsAppAccountsByUserId(user.id);
      whatsappConnected = whatsappAccounts.length > 0;
    } catch (error) {
      console.error("Error checking WhatsApp accounts:", error);
      // If error checking WhatsApp, assume not connected
      whatsappConnected = false;
    }

    return NextResponse.json({
      onboardingCompleted: user.onboarding_completed,
      whatsappConnected: whatsappConnected,
    });
  } catch (error: any) {
    console.error("Error checking onboarding status:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error.message || "Unknown error",
      },
      { status: 500 },
    );
  }
}
