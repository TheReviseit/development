import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { isProductAvailableForActivation } from "@/lib/auth-helpers";
import type { AuthErrorCode, ProductActivationRequest } from "@/types/auth.types";

/**
 * POST /api/products/activate
 *
 * Legacy compatibility endpoint.
 *
 * Product activation used to create a trial membership directly. That is no
 * longer allowed: signup/auth sync are identity-only, and trials can start only
 * after the user explicitly selects the Starter plan in onboarding.
 */
export async function POST(request: NextRequest) {
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

  try {
    await adminAuth.verifySessionCookie(sessionCookie);
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

  const body: ProductActivationRequest = await request
    .json()
    .catch(() => ({} as ProductActivationRequest));
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

  if (!isProductAvailableForActivation(product)) {
    return NextResponse.json(
      {
        success: false,
        error: `${product} is not available for self-service activation`,
        code: "PRODUCT_NOT_AVAILABLE" as AuthErrorCode,
      },
      { status: 403 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Plan selection is required before starting access. Choose the Starter plan from onboarding to begin a free trial.",
      code: "PLAN_SELECTION_REQUIRED" as AuthErrorCode,
      nextPath: `/onboarding-embedded?domain=${product}`,
    },
    { status: 409 },
  );
}
