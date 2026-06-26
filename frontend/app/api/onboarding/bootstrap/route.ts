import { NextRequest, NextResponse } from "next/server";
import {
  getOnboardingBootstrapConfig,
  ONBOARDING_BOOTSTRAP_CACHE_CONTROL,
  resolveProductDomainFromRequest,
} from "@/lib/onboarding/bootstrap.server";

export async function GET(request: NextRequest) {
  const start = Date.now();

  try {
    const domain = resolveProductDomainFromRequest(request);
    const payload = await getOnboardingBootstrapConfig(domain);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": ONBOARDING_BOOTSTRAP_CACHE_CONTROL,
        "Server-Timing": `onboarding_bootstrap;dur=${Date.now() - start}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isInvalidDomain = message === "INVALID_DOMAIN";

    return NextResponse.json(
      {
        success: false,
        error: isInvalidDomain
          ? "INVALID_DOMAIN"
          : "ONBOARDING_BOOTSTRAP_UNAVAILABLE",
      },
      {
        status: isInvalidDomain ? 400 : 503,
        headers: {
          "Cache-Control": "no-store",
          "Server-Timing": `onboarding_bootstrap;dur=${Date.now() - start}`,
        },
      },
    );
  }
}
