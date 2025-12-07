import { NextRequest, NextResponse } from "next/server";
import { getUserByFirebaseUID } from "@/lib/supabase/queries";

export async function GET(request: NextRequest) {
  try {
    const firebaseUID = request.headers.get("firebase-uid");

    if (!firebaseUID) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await getUserByFirebaseUID(firebaseUID);

    if (!user) {
      return NextResponse.json({ onboardingCompleted: false });
    }

    return NextResponse.json({
      onboardingCompleted: user.onboarding_completed,
    });
  } catch (error: any) {
    console.error("Error checking onboarding status:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
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
