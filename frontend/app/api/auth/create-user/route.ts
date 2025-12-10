import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByFirebaseUID } from "@/lib/supabase/queries";
import { sendWelcomeEmail } from "@/lib/email/automated-emails";
import { createUserSchema } from "@/lib/validation/schemas";

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
      return NextResponse.json({ user: existingUser, created: false });
    }

    // Create new user
    const user = await createUser({
      firebase_uid,
      full_name: full_name || "",
      email,
    });

    // Send welcome email automatically to new users
    // This runs in the background and doesn't block user creation
    sendWelcomeEmail(email, full_name || "there")
      .then((result) => {
        if (result.success) {
          console.log(`✅ Welcome email sent to ${email}`);
        } else {
          console.error(
            `❌ Failed to send welcome email to ${email}:`,
            result.error
          );
        }
      })
      .catch((error) => {
        console.error(`❌ Error sending welcome email to ${email}:`, error);
      });

    return NextResponse.json({ user, created: true });
  } catch (error: any) {
    console.error("Error creating user:", error);
    // Log more detailed error information
    console.error("Error details:", {
      message: error.message,
      code: error.code,
    });
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
