import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, adminAuth } from "@/lib/firebase-admin";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { sendEmail } from "@/lib/email/resend";
import { generateEmailHtml } from "@/lib/email/email-templates";
import type {
  SyncUserRequest,
  SyncUserResponse,
  SupabaseUser,
} from "@/types/auth.types";

/**
 * POST /api/auth/sync
 *
 * Syncs Firebase authenticated user to Supabase database
 *
 * Flow:
 * 1. Receive Firebase ID token from client
 * 2. Verify token using Firebase Admin SDK
 * 3. Extract user data from decoded token
 * 4. Upsert user record in Supabase
 * 5. Return synced user data
 *
 * Security:
 * - Uses service_role key to bypass RLS for sync
 * - Only accepts valid Firebase tokens
 * - HTTPS only in production
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: SyncUserRequest = await request.json();
    const { idToken } = body;

    // CRITICAL: Explicit allowCreate blocking (fail closed, not open)
    // If not explicitly set to true, user creation is BLOCKED
    const allowCreate = body.allowCreate === true;

    if (!idToken) {
      return NextResponse.json(
        { success: false, error: "Missing idToken in request body" },
        { status: 400 },
      );
    }

    // Verify Firebase ID token
    const verificationResult = await verifyIdToken(idToken);

    if (!verificationResult.success || !verificationResult.data) {
      const firebaseUid = "UNKNOWN";
      console.info("[AUTH_SYNC_VERDICT]", {
        firebaseUid,
        allowCreate,
        result: "TOKEN_INVALID",
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json(
        { success: false, error: "Invalid or expired Firebase token" },
        { status: 401 },
      );
    }

    const decodedToken = verificationResult.data;

    // Extract user data from token
    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email || "";
    const phoneNumber = decodedToken.phone_number || null;
    const fullName = decodedToken.name || email.split("@")[0] || "User";
    const provider = decodedToken.firebase?.sign_in_provider || "unknown";
    const emailVerified = decodedToken.email_verified || false;
    const phoneVerified = !!decodedToken.phone_number;

    // Initialize Supabase client with service_role key (bypasses RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // CRITICAL: Check if user exists in DB BEFORE creating session cookie
    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("firebase_uid", firebaseUid)
      .single();

    let userData: Partial<SupabaseUser>;

    if (existingUser) {
      // User exists - create session cookie and update record
      try {
        const expiresInMs = 60 * 60 * 24 * 5 * 1000; // 5 days
        const expiresInSeconds = 60 * 60 * 24 * 5;

        const sessionCookie = await adminAuth.createSessionCookie(idToken, {
          expiresIn: expiresInMs,
        });

        const cookieStore = await cookies();
        cookieStore.set("session", sessionCookie, {
          maxAge: expiresInSeconds,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          path: "/",
          sameSite: "lax",
        });

        console.log("[AUTH] Session cookie established for existing user");
      } catch (cookieError) {
        console.error("[AUTH] Failed to create session cookie:", cookieError);
        // Don't fail sync if cookie creation fails
      }

      // Update existing user - only update columns that exist in public.users table
      userData = {
        full_name: fullName,
        email: email,
        phone: phoneNumber || undefined,
      };

      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update(userData)
        .eq("firebase_uid", firebaseUid)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating user - Full error:", updateError);
        console.error("Update error details:", {
          code: updateError.code,
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
        });
        return NextResponse.json(
          {
            success: false,
            error: "Failed to update user record",
            details: updateError.message,
            code: updateError.code,
          },
          { status: 500 },
        );
      }

      console.info("[AUTH_SYNC_VERDICT]", {
        firebaseUid,
        email,
        allowCreate,
        result: "AUTHENTICATED",
        userAction: "UPDATED",
        timestamp: new Date().toISOString(),
      });

      console.log("✅ User synced successfully to Supabase");
      return NextResponse.json<SyncUserResponse>({
        success: true,
        user: updatedUser as SupabaseUser,
      });
    } else {
      // User does NOT exist in database
      // CRITICAL: Only create if allowCreate === true (fail closed)
      if (!allowCreate) {
        console.warn(
          `[AUTH] User not found in DB and allowCreate=false. Firebase UID: ${firebaseUid}, Email: ${email}`,
        );

        console.info("[AUTH_SYNC_VERDICT]", {
          firebaseUid,
          email,
          allowCreate,
          result: "USER_NOT_FOUND",
          timestamp: new Date().toISOString(),
        });

        // Clear session cookie on server side
        const cookieStore = await cookies();
        cookieStore.delete("session");
        console.log("[AUTH] Session cookie cleared (user not found)");

        const response = NextResponse.json(
          {
            success: false,
            error: "User account not found in database",
            code: "USER_NOT_FOUND",
            message:
              "Your account was not fully created. Please sign up again to complete setup.",
          },
          { status: 404 },
        );

        // Ensure cookie is cleared in response as well
        response.cookies.delete("session");
        return response;
      }
      // allowCreate === true, proceed with user creation
      // Create session cookie for new user
      try {
        const expiresInMs = 60 * 60 * 24 * 5 * 1000; // 5 days
        const expiresInSeconds = 60 * 60 * 24 * 5;

        const sessionCookie = await adminAuth.createSessionCookie(idToken, {
          expiresIn: expiresInMs,
        });

        const cookieStore = await cookies();
        cookieStore.set("session", sessionCookie, {
          maxAge: expiresInSeconds,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          path: "/",
          sameSite: "lax",
        });

        console.log("[AUTH] Session cookie established for new user");
      } catch (cookieError) {
        console.error("[AUTH] Failed to create session cookie:", cookieError);
      }

      // Insert new user - only use columns that exist in public.users table
      userData = {
        firebase_uid: firebaseUid,
        full_name: fullName,
        email: email,
        phone: phoneNumber || undefined,
        role: "user",
        onboarding_completed: false,
      };

      console.log("Attempting to insert user with data:", {
        firebase_uid: firebaseUid,
        email: email,
        full_name: fullName,
      });

      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert([userData])
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting user - Full error:", insertError);
        console.error("Error details:", {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
        });

        // Check if it's a duplicate key error (user exists with different firebase_uid)
        if (insertError.code === "23505") {
          return NextResponse.json(
            {
              success: false,
              error: "User already exists with a different account",
              code: "DUPLICATE_USER",
            },
            { status: 409 },
          );
        }

        return NextResponse.json(
          {
            success: false,
            error: "Failed to create user record",
            code: "INSERT_FAILED",
            details: insertError.message,
          },
          { status: 500 },
        );
      }

      console.info("[AUTH_SYNC_VERDICT]", {
        firebaseUid,
        email,
        allowCreate,
        result: "AUTHENTICATED",
        userAction: "CREATED",
        timestamp: new Date().toISOString(),
      });

      console.log(`🎉 New user created: ${email} (${fullName})`);

      // Send welcome email to new user
      try {
        console.log(`📧 Attempting to send welcome email to ${email}...`);

        const welcomeHtml = generateEmailHtml("welcome", {
          userName: fullName,
          userEmail: email,
        });

        if (welcomeHtml) {
          console.log("✅ Welcome email HTML generated successfully");

          // Send welcome email asynchronously (don't wait for it)
          sendEmail({
            to: email,
            subject: "Welcome to Flowauxi! 🎉",
            html: welcomeHtml,
          })
            .then((result) => {
              if (result.success) {
                console.log(`✅ Welcome email sent successfully to ${email}`);
              } else {
                console.error(
                  `❌ Failed to send welcome email to ${email}:`,
                  result.error,
                );
              }
            })
            .catch((err) => {
              console.error("❌ Error sending welcome email:", err);
            });
        } else {
          console.error("❌ Failed to generate welcome email HTML");
        }
      } catch (emailError) {
        // Don't fail signup if email fails - just log it
        console.error("❌ Failed to send welcome email:", emailError);
      }

      return NextResponse.json<SyncUserResponse>({
        success: true,
        user: newUser as SupabaseUser,
      });
    }
  } catch (error: any) {
    console.error("Sync API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/auth/sync
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "Firebase → Supabase sync endpoint is running",
    timestamp: new Date().toISOString(),
  });
}
