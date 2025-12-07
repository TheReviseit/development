import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { createClient } from "@supabase/supabase-js";
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

    if (!idToken) {
      return NextResponse.json(
        { success: false, error: "Missing idToken in request body" },
        { status: 400 }
      );
    }

    // Verify Firebase ID token
    const verificationResult = await verifyIdToken(idToken);

    if (!verificationResult.success || !verificationResult.data) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired Firebase token" },
        { status: 401 }
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
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Upsert user in Supabase
    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("firebase_uid", firebaseUid)
      .single();

    let userData: Partial<SupabaseUser>;

    if (existingUser) {
      // Update existing user
      userData = {
        full_name: fullName,
        email: email,
        phone: phoneNumber || undefined,
        phone_verified: phoneVerified,
        provider: provider,
        last_sign_in_at: new Date().toISOString(),
      };

      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update(userData)
        .eq("firebase_uid", firebaseUid)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating user:", updateError);
        return NextResponse.json(
          { success: false, error: "Failed to update user record" },
          { status: 500 }
        );
      }

      return NextResponse.json<SyncUserResponse>({
        success: true,
        user: updatedUser as SupabaseUser,
      });
    } else {
      // Insert new user
      userData = {
        firebase_uid: firebaseUid,
        full_name: fullName,
        email: email,
        phone: phoneNumber || undefined,
        phone_verified: phoneVerified,
        provider: provider,
        role: "user",
        onboarding_completed: false,
        last_sign_in_at: new Date().toISOString(),
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
        return NextResponse.json(
          {
            success: false,
            error: "Failed to create user record",
            details: insertError.message, // Include error details for debugging
          },
          { status: 500 }
        );
      }

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
            subject: "Welcome to ReviseIt! 🎉",
            html: welcomeHtml,
          })
            .then((result) => {
              if (result.success) {
                console.log(`✅ Welcome email sent successfully to ${email}`);
              } else {
                console.error(
                  `❌ Failed to send welcome email to ${email}:`,
                  result.error
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
      { status: 500 }
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
