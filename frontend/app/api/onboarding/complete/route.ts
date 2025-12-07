import { NextRequest, NextResponse } from "next/server";
import {
  getUserByFirebaseUID,
  markOnboardingComplete,
} from "@/lib/supabase/queries";

export async function POST(request: NextRequest) {
  try {
    const firebaseUID = request.headers.get("firebase-uid");

    if (!firebaseUID) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Mark onboarding as complete
    await markOnboardingComplete(firebaseUID);

    return NextResponse.json({ success: true });
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
