import { NextRequest, NextResponse } from "next/server";
import {
  getOnboardingBootstrapConfig,
  ONBOARDING_BOOTSTRAP_CACHE_CONTROL,
  resolveProductDomainFromRequest,
  toLegacyPricingPlans,
} from "@/lib/onboarding/bootstrap.server";

export async function GET(request: NextRequest) {
  const start = Date.now();

  try {
    const domain = resolveProductDomainFromRequest(request);
    const bootstrap = await getOnboardingBootstrapConfig(domain);

    return NextResponse.json(
      {
        success: true,
        domain,
        plans: toLegacyPricingPlans(bootstrap.pricing.plans),
      },
      {
        headers: {
          "Cache-Control": ONBOARDING_BOOTSTRAP_CACHE_CONTROL,
          "Server-Timing": `pricing_plans;dur=${Date.now() - start}`,
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : "";
    const isInvalidDomain = message === "INVALID_DOMAIN";
    const isMissingPricing = name === "PRICING_NOT_CONFIGURED";

    return NextResponse.json(
      {
        success: false,
        plans: [],
        error: isInvalidDomain
          ? "Invalid product domain"
          : isMissingPricing
            ? message
            : "Failed to load pricing plans",
        errorCode: isInvalidDomain
          ? "INVALID_DOMAIN"
          : isMissingPricing
            ? "PRICING_NOT_CONFIGURED"
            : "PRICING_LOOKUP_FAILED",
      },
      {
        status: isInvalidDomain ? 400 : isMissingPricing ? 404 : 500,
        headers: {
          "Cache-Control": "no-store",
          "Server-Timing": `pricing_plans;dur=${Date.now() - start}`,
        },
      },
    );
  }
}
