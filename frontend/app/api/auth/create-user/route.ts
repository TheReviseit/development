import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByFirebaseUID } from "@/lib/supabase/queries";
import { sendWelcomeEmail } from "@/lib/email/automated-emails";
import { createUserSchema } from "@/lib/validation/schemas";
import { getUserCache } from "@/app/utils/userCache";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ✅ SECURE: Validate input with Zod
    const validationResult = createUserSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { firebase_uid, email, full_name } = validationResult.data;

    // Check if user already exists
    const existingUser = await getUserByFirebaseUID(firebase_uid);
    if (existingUser) {
      // User exists - add to cache if not already there
      const cache = getUserCache();
      cache.set(existingUser);

      return NextResponse.json({ user: existingUser, created: false });
    }

    // Create new user
    const user = await createUser({
      firebase_uid,
      full_name: full_name || "",
      email,
    });

    // Add newly created user to cache for fast future lookups
    const cache = getUserCache();
    cache.set(user);
    console.log("[create-user] User cached successfully");

    // Note: Welcome email is now sent AFTER email verification
    // (see /api/auth/verify-email route)

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

    // In development, log the full stack trace
    if (process.env.NODE_ENV !== "production") {
      console.error("Full error stack:", error);
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        message:
          process.env.NODE_ENV === "production"
            ? undefined
            : error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
