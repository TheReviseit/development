import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, adminAuth } from "@/lib/firebase-admin";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { sendEmail } from "@/lib/email/resend";
import { generateEmailHtml } from "@/lib/email/email-templates";
import {
  detectProductFromRequest,
  getRequestContext,
  isProductAvailableForActivation,
  calculateTrialEndDate,
} from "@/lib/auth-helpers";
import type {
  SyncUserRequest,
  SyncUserResponse,
  SupabaseUser,
  ProductDomain,
  AuthErrorCode,
  ProductMembership,
} from "@/types/auth.types";

/**
 * POST /api/auth/sync
 *
 * Enterprise-grade auth sync endpoint with product membership validation
 * Standard: Google Workspace / Zoho One Architecture
 *
 * Flow (Option B):
 * 1. Verify Firebase ID token
 * 2. Detect current product domain from request
 * 3. Check if user exists in Supabase
 * 4. NEW: Check product membership for current domain
 * 5. Create session cookie ONLY if membership valid
 * 6. Return user data OR product_not_enabled state
 *
 * Response States:
 * - 200 AUTHENTICATED: User exists + has product membership
 * - 403 PRODUCT_NOT_ENABLED: User exists but NO membership for current domain
 * - 404 USER_NOT_FOUND: User not in DB (orphaned Firebase account)
 * - 401 INVALID_TOKEN: Firebase token verification failed
 * - 500 SERVER_ERROR: Database or system error
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ========================================================================
    // SECTION 1: REQUEST PARSING & VALIDATION
    // ========================================================================

    const body: SyncUserRequest = await request.json();
    const { idToken } = body;

    // CRITICAL: Explicit allowCreate blocking (fail closed, not open)
    const allowCreate = body.allowCreate === true;

    // Detect current product domain (NEW in Option B)
    const currentProduct: ProductDomain = detectProductFromRequest(request);

    // Extract request context for audit logging
    const requestContext = getRequestContext(request);

    console.log(
      `[AUTH_SYNC] Request started - product=${currentProduct}, allowCreate=${allowCreate}, request_id=${requestContext.request_id}`,
    );

    if (!idToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing idToken in request body",
          code: "MISSING_REQUIRED_FIELD" as AuthErrorCode,
        },
        { status: 400 },
      );
    }

    // ========================================================================
    // SECTION 2: FIREBASE TOKEN VERIFICATION
    // ========================================================================

    const verificationResult = await verifyIdToken(idToken);

    if (!verificationResult.success || !verificationResult.data) {
      console.warn(
        `[AUTH_SYNC] Token verification failed - request_id=${requestContext.request_id}`,
      );

      return NextResponse.json(
        {
          success: false,
          error: "Invalid or expired Firebase token",
          code: "INVALID_TOKEN" as AuthErrorCode,
        },
        { status: 401 },
      );
    }

    const decodedToken = verificationResult.data;
    const firebaseUid = decodedToken.uid;
    const email = decodedToken.email || "";
    const phoneNumber = decodedToken.phone_number || null;
    const fullName = decodedToken.name || email.split("@")[0] || "User";
    const provider = decodedToken.firebase?.sign_in_provider || "unknown";

    console.log(
      `[AUTH_SYNC] Token verified - firebase_uid=${firebaseUid}, email=${email}`,
    );

    // ========================================================================
    // SECTION 3: INITIALIZE SUPABASE CLIENT
    // ========================================================================

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[AUTH_SYNC] Missing Supabase environment variables");
      return NextResponse.json(
        {
          success: false,
          error: "Server configuration error",
          code: "SERVER_ERROR" as AuthErrorCode,
        },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // ========================================================================
    // SECTION 4: CHECK IF USER EXISTS
    // ========================================================================

    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("*")
      .eq("firebase_uid", firebaseUid)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      // PGRST116 = not found error (expected), other errors are critical
      console.error(`[AUTH_SYNC] Database error fetching user:`, fetchError);
      return NextResponse.json(
        {
          success: false,
          error: "Database error",
          code: "DATABASE_ERROR" as AuthErrorCode,
          details: fetchError.message,
        },
        { status: 500 },
      );
    }

    // ========================================================================
    // SECTION 5A: USER DOES NOT EXIST (NEW USER OR ORPHANED FIREBASE ACCOUNT)
    // ========================================================================

    if (!existingUser) {
      if (!allowCreate) {
        // User not in DB and creation not allowed → orphaned Firebase account
        console.warn(
          `[AUTH_SYNC] User not found - firebase_uid=${firebaseUid}, allowCreate=false`,
        );

        // Clear session cookie
        const cookieStore = await cookies();
        cookieStore.delete("session");

        const response = NextResponse.json(
          {
            success: false,
            error: "User account not found in database",
            code: "USER_NOT_FOUND" as AuthErrorCode,
            message:
              "Your account was not fully created. Please sign up again to complete setup.",
          },
          { status: 404 },
        );

        response.cookies.delete("session");
        return response;
      }

      // ======================================================================
      // NEW USER CREATION (SIGNUP FLOW)
      // ======================================================================

      console.log(
        `[AUTH_SYNC] Creating new user - firebase_uid=${firebaseUid}, product=${currentProduct}`,
      );

      // Insert user record
      const { data: newUser, error: insertError } = await supabase
        .from("users")
        .insert({
          firebase_uid: firebaseUid,
          full_name: fullName,
          email: email,
          phone: phoneNumber,
          role: "user",
          onboarding_completed: false,
        })
        .select()
        .single();

      if (insertError || !newUser) {
        console.error(`[AUTH_SYNC] Failed to create user:`, insertError);
        return NextResponse.json(
          {
            success: false,
            error: "Failed to create user account",
            code: "DATABASE_ERROR" as AuthErrorCode,
            details: insertError?.message,
          },
          { status: 500 },
        );
      }

      // NEW (Option B): Create product membership for signup domain
      const trialEndsAt = isProductAvailableForActivation(currentProduct)
        ? calculateTrialEndDate(14)
        : null;

      const membershipStatus =
        currentProduct === "dashboard" ? "active" : "trial";

      const { error: membershipError } = await supabase
        .from("user_products")
        .insert({
          user_id: newUser.id,
          product: currentProduct,
          status: membershipStatus,
          activated_by: "signup",
          trial_ends_at: trialEndsAt?.toISOString(),
          trial_days: 14,
        });

      if (membershipError) {
        console.error(
          `[AUTH_SYNC] Failed to create product membership:`,
          membershipError,
        );
        // Don't fail signup if membership creation fails, log for manual fix
      } else {
        console.log(
          `[AUTH_SYNC] Product membership created - user_id=${newUser.id}, product=${currentProduct}, status=${membershipStatus}`,
        );
      }

      // Log activation event
      await supabase.from("product_activation_logs").insert({
        user_id: newUser.id,
        product: currentProduct,
        action: membershipStatus === "trial" ? "trial_started" : "activated",
        new_status: membershipStatus,
        initiated_by: "signup",
        ip_address: requestContext.ip_address,
        user_agent: requestContext.user_agent,
        request_id: requestContext.request_id,
      });

      // Create session cookie for new user
      try {
        const expiresInMs = 60 * 60 * 24 * 5 * 1000; // 5 days
        const sessionCookie = await adminAuth.createSessionCookie(idToken, {
          expiresIn: expiresInMs,
        });

        const cookieStore = await cookies();
        cookieStore.set("session", sessionCookie, {
          maxAge: 60 * 60 * 24 * 5,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          path: "/",
          sameSite: "lax",
        });

        console.log(`[AUTH_SYNC] Session cookie created for new user`);
      } catch (cookieError) {
        console.error(
          `[AUTH_SYNC] Failed to create session cookie:`,
          cookieError,
        );
      }

      // Send welcome email (async, don't wait)
      sendEmail({
        to: email,
        subject: "Welcome to Flowauxi! 🎉",
        html:
          generateEmailHtml("custom", {
            message: `
            <h3>Welcome to Flowauxi, ${fullName}!</h3>
            <p>Thank you for signing up. We're excited to have you on board.</p>
            <p>Your ${currentProduct} product is now active${membershipStatus === "trial" ? " with a 14-day free trial" : ""}.</p>
            <p>Get started by completing your profile setup.</p>
          `,
          }) ?? "",
      }).catch((err) =>
        console.error("[AUTH_SYNC] Failed to send welcome email:", err),
      );

      const elapsedMs = Date.now() - startTime;
      console.log(
        `[AUTH_SYNC] ✅ New user created - elapsed=${elapsedMs}ms, firebase_uid=${firebaseUid}`,
      );

      return NextResponse.json<SyncUserResponse>({
        success: true,
        user: newUser as SupabaseUser,
      });
    }

    // ========================================================================
    // SECTION 5B: USER EXISTS - CHECK PRODUCT MEMBERSHIP (OPTION B)
    // ========================================================================

    console.log(
      `[AUTH_SYNC] User exists - user_id=${existingUser.id}, checking product membership for ${currentProduct}`,
    );

    // Dashboard is always accessible (free tier)
    if (currentProduct === "dashboard") {
      console.log(`[AUTH_SYNC] Dashboard access granted (always free)`);

      // Create session cookie
      try {
        const expiresInMs = 60 * 60 * 24 * 5 * 1000;
        const sessionCookie = await adminAuth.createSessionCookie(idToken, {
          expiresIn: expiresInMs,
        });

        const cookieStore = await cookies();
        cookieStore.set("session", sessionCookie, {
          maxAge: 60 * 60 * 24 * 5,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          path: "/",
          sameSite: "lax",
        });
      } catch (cookieError) {
        console.error(
          `[AUTH_SYNC] Failed to create session cookie:`,
          cookieError,
        );
      }

      // Update user record (last_sign_in_at, phone, etc.)
      await supabase
        .from("users")
        .update({
          full_name: fullName,
          email: email,
          phone: phoneNumber,
        })
        .eq("firebase_uid", firebaseUid);

      const elapsedMs = Date.now() - startTime;
      console.log(`[AUTH_SYNC] ✅ Dashboard access - elapsed=${elapsedMs}ms`);

      return NextResponse.json<SyncUserResponse>({
        success: true,
        user: existingUser as SupabaseUser,
      });
    }

    // Check product membership for non-dashboard products
    const { data: membership, error: membershipError } = await supabase
      .from("user_products")
      .select("*")
      .eq("user_id", existingUser.id)
      .eq("product", currentProduct)
      .maybeSingle();

    if (membershipError) {
      console.error(
        `[AUTH_SYNC] Database error checking membership:`,
        membershipError,
      );
      return NextResponse.json(
        {
          success: false,
          error: "Database error",
          code: "DATABASE_ERROR" as AuthErrorCode,
        },
        { status: 500 },
      );
    }

    // No membership found OR membership is suspended/cancelled
    if (!membership || !["trial", "active"].includes(membership.status)) {
      console.warn(
        `[AUTH_SYNC] Product not enabled - user_id=${existingUser.id}, product=${currentProduct}, membership_status=${membership?.status || "none"}`,
      );

      // Fetch all user's products to show in activation UI
      const { data: userMemberships } = await supabase
        .from("user_products")
        .select("product")
        .eq("user_id", existingUser.id)
        .in("status", ["trial", "active"]);

      const availableProducts: ProductDomain[] = [
        "shop",
        "showcase",
        "marketing",
      ].filter(
        (p) => !userMemberships?.some((m) => m.product === p),
      ) as ProductDomain[];

      const elapsedMs = Date.now() - startTime;
      console.log(
        `[AUTH_SYNC] ⚠️  PRODUCT_NOT_ENABLED - elapsed=${elapsedMs}ms, available=${availableProducts.join(",")}`,
      );

      // DO NOT create session cookie (user doesn't have access to this product)
      return NextResponse.json<SyncUserResponse>(
        {
          success: false,
          code: "PRODUCT_NOT_ENABLED" as AuthErrorCode,
          message: `Activate ${currentProduct} to continue`,
          currentProduct,
          availableProducts,
        },
        { status: 403 }, // 403 Forbidden (not 401 Unauthorized)
      );
    }

    // ========================================================================
    // SECTION 6: PRODUCT MEMBERSHIP VALID - CREATE SESSION & RETURN USER
    // ========================================================================

    console.log(
      `[AUTH_SYNC] Product membership valid - user_id=${existingUser.id}, product=${currentProduct}, status=${membership.status}`,
    );

    // Create session cookie
    try {
      const expiresInMs = 60 * 60 * 24 * 5 * 1000;
      const sessionCookie = await adminAuth.createSessionCookie(idToken, {
        expiresIn: expiresInMs,
      });

      const cookieStore = await cookies();
      cookieStore.set("session", sessionCookie, {
        maxAge: 60 * 60 * 24 * 5,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        sameSite: "lax",
      });

      console.log(`[AUTH_SYNC] Session cookie created`);
    } catch (cookieError) {
      console.error(
        `[AUTH_SYNC] Failed to create session cookie:`,
        cookieError,
      );
    }

    // Update user record
    const { data: updatedUser } = await supabase
      .from("users")
      .update({
        full_name: fullName,
        email: email,
        phone: phoneNumber,
      })
      .eq("firebase_uid", firebaseUid)
      .select()
      .single();

    const elapsedMs = Date.now() - startTime;
    console.log(
      `[AUTH_SYNC] ✅ AUTHENTICATED - elapsed=${elapsedMs}ms, firebase_uid=${firebaseUid}, product=${currentProduct}`,
    );

    return NextResponse.json<SyncUserResponse>({
      success: true,
      user: (updatedUser || existingUser) as SupabaseUser,
    });
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime;
    console.error(
      `[AUTH_SYNC] ❌ Unhandled error - elapsed=${elapsedMs}ms:`,
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        code: "SERVER_ERROR" as AuthErrorCode,
        details: error.message,
      },
      { status: 500 },
    );
  }
}
