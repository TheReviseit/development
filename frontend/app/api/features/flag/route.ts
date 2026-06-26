import { NextRequest, NextResponse } from "next/server";
import {
  getFeatureFlagDecision,
  isValidFeatureKey,
  ONBOARDING_BOOTSTRAP_CACHE_CONTROL,
} from "@/lib/onboarding/bootstrap.server";

export async function GET(request: NextRequest) {
  const start = Date.now();
  const featureKey = request.nextUrl.searchParams.get("feature")?.trim();

  if (!featureKey || !isValidFeatureKey(featureKey)) {
    return NextResponse.json(
      {
        enabled: false,
        error: "INVALID_FEATURE_KEY",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await getFeatureFlagDecision(featureKey);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": ONBOARDING_BOOTSTRAP_CACHE_CONTROL,
        "Server-Timing": `feature_flag;dur=${Date.now() - start}`,
      },
    });
  } catch (error) {
    const isMissing = error instanceof Error && error.name === "FLAG_NOT_FOUND";

    console.warn("[feature-flag] lookup_failed", {
      featureKey,
      message: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        enabled: false,
        featureKey,
        error: isMissing ? "FLAG_NOT_FOUND" : "LOOKUP_FAILED",
      },
      {
        status: isMissing ? 404 : 503,
        headers: {
          "Cache-Control": "no-store",
          "Server-Timing": `feature_flag;dur=${Date.now() - start}`,
        },
      },
    );
  }
}
