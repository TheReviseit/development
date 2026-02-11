import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, adminAuth } from "@/lib/firebase-admin";
import { createClient } from "@supabase/supabase-js";
import {
  getRequestContext,
  isProductAvailableForActivation,
  calculateTrialEndDate,
} from "@/lib/auth-helpers";
import type {
  ProductActivationRequest,
  ProductActivationResponse,
  ProductDomain,
  AuthErrorCode,
  ProductMembership,
} from "@/types/auth.types";

/**
 * POST /api/products/activate
 *
 * Enterprise product activation endpoint
 * Standard: Google Workspace / Zoho One self-service activation
 *
 * Flow:
 * 1. Verify user is authenticated (session cookie)
 * 2. Validate product is available for activation
 * 3. Check if user already has membership
 * 4. Create product membership (trial status)
 * 5. Log activation event for audit
 * 6. Return membership details
 *
 * Security:
 * - Requires valid session cookie
 * - Server-side product availability check
 * - Prevents duplicate activations
 * - Full audit trail
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // ========================================================================
    // SECTION 1: AUTHENTICATION
    // ========================================================================

    const sessionCookie = request.cookies.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json(
        {
          success: false,
          error: "Not authenticated",
          code: "UNAUTHORIZED" as AuthErrorCode,
        },
        { status: 401 },
      );
    }

    // Verify session cookie (extract Firebase UID)
    let firebaseUid: string;

    try {
      const decodedCookie = await adminAuth.verifySessionCookie(sessionCookie);
      firebaseUid = decodedCookie.uid;
    } catch (error) {
      console.error("[PRODUCT_ACTIVATE] Session verification failed:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Invalid session",
          code: "INVALID_SESSION" as AuthErrorCode,
        },
        { status: 401 },
      );
    }

    console.log(
      `[PRODUCT_ACTIVATE] Request started - firebase_uid=${firebaseUid}`,
    );

    // ========================================================================
    // SECTION 2: REQUEST VALIDATION
    // ========================================================================

    const body: ProductActivationRequest = await request.json();
    const { product } = body;

    if (!product) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing product parameter",
          code: "MISSING_REQUIRED_FIELD" as AuthErrorCode,
        },
        { status: 400 },
      );
    }

    // Validate product is available for activation
    if (!isProductAvailableForActivation(product)) {
      console.warn(
        `[PRODUCT_ACTIVATE] Product not available - product=${product}, firebase_uid=${firebaseUid}`,
      );
      return NextResponse.json(
        {
          success: false,
          error: `${product} is not available for self-service activation`,
          code: "PRODUCT_NOT_AVAILABLE" as AuthErrorCode,
        },
        { status: 403 },
      );
    }

    // ========================================================================
    // SECTION 3: INITIALIZE SUPABASE & GET USER
    // ========================================================================

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error(
        "[PRODUCT_ACTIVATE] Missing Supabase environment variables",
      );
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

    // Get user from DB
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, email, full_name")
      .eq("firebase_uid", firebaseUid)
      .single();

    if (userError || !user) {
      console.error("[PRODUCT_ACTIVATE] User not found:", userError);
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
          code: "USER_NOT_FOUND" as AuthErrorCode,
        },
        { status: 404 },
      );
    }

    console.log(
      `[PRODUCT_ACTIVATE] User found - user_id=${user.id}, product=${product}`,
    );

    // ========================================================================
    // SECTION 4: CHECK FOR EXISTING MEMBERSHIP
    // ========================================================================

    const { data: existingMembership, error: membershipFetchError } =
      await supabase
        .from("user_products")
        .select("*")
        .eq("user_id", user.id)
        .eq("product", product)
        .maybeSingle();

    if (membershipFetchError) {
      console.error(
        "[PRODUCT_ACTIVATE] Database error checking membership:",
        membershipFetchError,
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

    // Check if already active
    if (
      existingMembership &&
      ["trial", "active"].includes(existingMembership.status)
    ) {
      console.warn(
        `[PRODUCT_ACTIVATE] Already active - user_id=${user.id}, product=${product}, status=${existingMembership.status}`,
      );
      return NextResponse.json(
        {
          success: false,
          error: `${product} is already activated`,
          code: "ALREADY_ACTIVE" as AuthErrorCode,
          membership: existingMembership as ProductMembership,
        },
        { status: 400 },
      );
    }

    // If membership exists but is suspended/cancelled, we'll reactivate it
    const isReactivation = !!existingMembership;

    // ========================================================================
    // SECTION 5: CREATE OR REACTIVATE MEMBERSHIP
    // ========================================================================

    const trialDays = 14;
    const trialEndsAt = calculateTrialEndDate(trialDays);
    const requestContext = getRequestContext(request);

    let membership: ProductMembership;

    if (isReactivation) {
      // Reactivate existing membership
      console.log(
        `[PRODUCT_ACTIVATE] Reactivating membership - user_id=${user.id}, product=${product}`,
      );

      const { data: reactivatedMembership, error: updateError } = await supabase
        .from("user_products")
        .update({
          status: "trial",
          trial_ends_at: trialEndsAt.toISOString(),
          trial_days: trialDays,
          reactivated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingMembership.id)
        .select()
        .single();

      if (updateError || !reactivatedMembership) {
        console.error(
          "[PRODUCT_ACTIVATE] Failed to reactivate membership:",
          updateError,
        );
        return NextResponse.json(
          {
            success: false,
            error: "Failed to reactivate product",
            code: "ACTIVATION_FAILED" as AuthErrorCode,
          },
          { status: 500 },
        );
      }

      membership = reactivatedMembership as ProductMembership;

      // Log reactivation
      await supabase.from("product_activation_logs").insert({
        user_id: user.id,
        user_product_id: membership.id,
        product,
        action: "reactivated",
        previous_status: existingMembership.status,
        new_status: "trial",
        initiated_by: "user",
        ip_address: requestContext.ip_address,
        user_agent: requestContext.user_agent,
        request_id: requestContext.request_id,
      });
    } else {
      // Create new membership
      console.log(
        `[PRODUCT_ACTIVATE] Creating new membership - user_id=${user.id}, product=${product}`,
      );

      const { data: newMembership, error: insertError } = await supabase
        .from("user_products")
        .insert({
          user_id: user.id,
          product,
          status: "trial",
          activated_by: "activation",
          trial_ends_at: trialEndsAt.toISOString(),
          trial_days: trialDays,
        })
        .select()
        .single();

      if (insertError || !newMembership) {
        console.error(
          "[PRODUCT_ACTIVATE] Failed to create membership:",
          insertError,
        );

        // Check if it's a duplicate error
        if (insertError?.code === "23505") {
          return NextResponse.json(
            {
              success: false,
              error: "Product already activated",
              code: "ALREADY_ACTIVE" as AuthErrorCode,
            },
            { status: 400 },
          );
        }

        return NextResponse.json(
          {
            success: false,
            error: "Failed to activate product",
            code: "ACTIVATION_FAILED" as AuthErrorCode,
            details: insertError?.message,
          },
          { status: 500 },
        );
      }

      membership = newMembership as ProductMembership;

      // Log activation
      await supabase.from("product_activation_logs").insert({
        user_id: user.id,
        user_product_id: membership.id,
        product,
        action: "trial_started",
        new_status: "trial",
        initiated_by: "user",
        ip_address: requestContext.ip_address,
        user_agent: requestContext.user_agent,
        request_id: requestContext.request_id,
        metadata: {
          trial_days: trialDays,
          user_email: user.email,
          user_name: user.full_name,
        },
      });
    }

    // ========================================================================
    // SECTION 6: SUCCESS RESPONSE
    // ========================================================================

    const elapsedMs = Date.now() - startTime;
    console.log(
      `[PRODUCT_ACTIVATE] ✅ ${isReactivation ? "Reactivated" : "Activated"} - elapsed=${elapsedMs}ms, user_id=${user.id}, product=${product}, trial_ends=${trialEndsAt.toISOString()}`,
    );

    return NextResponse.json<ProductActivationResponse>({
      success: true,
      membership,
      trialEndsAt: trialEndsAt.toISOString(),
      message: `${product} activated! You have ${trialDays} days free trial.`,
    });
  } catch (error: any) {
    const elapsedMs = Date.now() - startTime;
    console.error(
      `[PRODUCT_ACTIVATE] ❌ Unhandled error - elapsed=${elapsedMs}ms:`,
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
