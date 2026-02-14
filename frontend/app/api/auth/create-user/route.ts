import { NextRequest, NextResponse } from "next/server";
import {
  createUser,
  getUserByFirebaseUID,
  getUserByEmail,
  updateUserFirebaseUID,
} from "@/lib/supabase/queries";
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
        { status: 400 },
      );
    }

    const { firebase_uid, email, full_name, phone } = validationResult.data;

    // Check if user already exists by firebase_uid
    const existingUser = await getUserByFirebaseUID(firebase_uid);
    if (existingUser) {
      // User exists with same firebase_uid - add to cache if not already there
      const cache = getUserCache();
      cache.set(existingUser);

      return NextResponse.json({ user: existingUser, created: false });
    }

    // Check if user exists by email (handles Firebase project migration)
    const existingUserByEmail = await getUserByEmail(email);
    if (existingUserByEmail) {
      console.log(
        `[create-user] Email ${email} exists with different firebase_uid. Updating...`,
      );
      // User exists with different firebase_uid - this happens when switching Firebase projects
      const updatedUser = await updateUserFirebaseUID(email, firebase_uid);

      // Update cache with new firebase_uid
      const cache = getUserCache();
      cache.set(updatedUser);

      console.log(
        `[create-user] Successfully migrated user ${email} to new Firebase project`,
      );
      return NextResponse.json({
        user: updatedUser,
        created: false,
        migrated: true,
      });
    }

    // Create new user
    const user = await createUser({
      firebase_uid,
      full_name: full_name || "",
      email,
      phone,
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
      { status: 500 },
    );
  }
}
