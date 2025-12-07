import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByFirebaseUID } from "@/lib/supabase/queries";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firebase_uid, full_name, email } = body;

    if (!firebase_uid || !email) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await getUserByFirebaseUID(firebase_uid);
    if (existingUser) {
      return NextResponse.json({ user: existingUser, created: false });
    }

    // Create new user
    const user = await createUser({
      firebase_uid,
      full_name: full_name || "",
      email,
    });

    return NextResponse.json({ user, created: true });
  } catch (error: any) {
    console.error("Error creating user:", error);
    // Log more detailed error information
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      { 
        error: "Internal server error",
        message: error.message || "Unknown error"
      },
      { status: 500 }
    );
  }
}
