import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/firebase-admin";
import { withTimeout } from "@/lib/server/fetchWithTimeout";
import {
  createSupabaseServiceClientOrThrow,
  ensureSupabaseUserAndMembership,
} from "@/lib/auth/provisioning.server";
import { detectProductFromRequest, getRequestContext, isProductAvailableForActivation } from "@/lib/auth-helpers";
import type { AuthErrorCode, ProductDomain } from "@/types/auth.types";
import { getUserCache } from "@/app/utils/userCache";

/**
 * POST /api/auth/create-user (LEGACY COMPAT)
 *
 * Canonical provisioning is `POST /api/auth/sync`.
 * This endpoint is retained for older clients/tools.
 *
 * Security:
 * - Requires a Firebase ID token (idToken)
 * - Never trusts client-supplied firebase_uid/email/name without token verification
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as any;
    const idToken = body?.idToken as string | undefined;
    const requestedDomain = body?.signup_domain as ProductDomain | undefined;

    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Missing idToken in request body",
          code: "MISSING_REQUIRED_FIELD" as AuthErrorCode,
        },
        { status: 400 },
      );
    }

    const requestContext = getRequestContext(request);
    const currentProduct: ProductDomain =
      requestedDomain || detectProductFromRequest(request);

    const verificationResult = await withTimeout(
      verifyIdToken(idToken),
      5000,
      "FIREBASE_ID_TOKEN_VERIFY_TIMEOUT",
    );

    if (!verificationResult.success || !verificationResult.data) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid or expired Firebase token",
          code: "INVALID_TOKEN" as AuthErrorCode,
        },
        { status: 401 },
      );
    }

    const decoded = verificationResult.data;
    const firebaseUid = decoded.uid;
    const email = decoded.email || "";
    const phoneNumber = decoded.phone_number || null;
    const fullName = decoded.name || email.split("@")[0] || "User";

    const supabase = createSupabaseServiceClientOrThrow({ timeoutMs: 5000 });

    const { user, created } = await ensureSupabaseUserAndMembership({
      supabase,
      firebaseUid,
      email,
      fullName,
      phoneNumber,
      currentProduct,
      allowCreate: true,
      requestContext,
      allowLegacyMigration: true,
    });

    // Cache for fast lookups used by check-user-exists
    try {
      const cache = getUserCache();
      cache.set(user);
    } catch {
      // Cache is a performance optimization only.
    }

    // Auto-start free trial for self-service products (best-effort, idempotent)
    let trial = null;
    if (isProductAvailableForActivation(currentProduct)) {
      try {
        const { auto_start_trial_on_signup } = await import("@/lib/trial");
        trial = await auto_start_trial_on_signup(
          user.id,
          user.id,
          email,
          currentProduct,
        );
      } catch (trialErr) {
        console.error("[create-user] Trial start error:", trialErr);
      }
    }

    return NextResponse.json({
      success: true,
      user,
      created,
      trial,
      deprecated: true,
    });
  } catch (error: any) {
    const message = String(error?.message || "Unknown error");
    const looksLikeTimeout =
      message.includes("AbortError") ||
      message.includes("aborted") ||
      message.includes("timeout");

    if (looksLikeTimeout) {
      return NextResponse.json(
        {
          success: false,
          error: "Upstream timeout",
          code: "UPSTREAM_TIMEOUT" as AuthErrorCode,
        },
        { status: 504 },
      );
    }

    console.error("[create-user] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        code: "SERVER_ERROR" as AuthErrorCode,
        details: process.env.NODE_ENV === "production" ? undefined : message,
      },
      { status: 500 },
    );
  }
}

