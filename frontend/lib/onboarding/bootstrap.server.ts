import "server-only";

import type { NextRequest } from "next/server";
import {
  isValidProductDomain,
  resolveDomain,
  type ProductDomain,
} from "@/lib/domain/config";
import { getSupabaseServiceClient } from "@/lib/supabase/service-client";

export const ONBOARDING_BOOTSTRAP_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=300";

const FRESH_TTL_MS = 60_000;
const STALE_TTL_MS = 5 * 60_000;
const SUPABASE_TIMEOUT_MS = 2_500;
const FEATURE_KEY_PATTERN = /^[a-z0-9_:-]{3,100}$/;
const ONBOARDING_PRICING_TRIAL_TOGGLE_FLAG =
  "onboarding_pricing_trial_toggle";

type PricingPlanRow = {
  plan_slug: string | null;
  display_name: string | null;
  description: string | null;
  amount_paise: number | null;
  currency: string | null;
  billing_cycle: string | null;
  features_json: unknown;
  limits_json: unknown;
};

type FeatureFlagRow = {
  feature_key: string;
  is_enabled_globally: boolean | null;
  updated_at: string | null;
};

export type OnboardingBootstrapPlan = {
  id: string;
  name: string;
  priceDisplay: string;
  description: string;
  features: string[];
  price: number;
  currency: string;
  limits?: Record<string, number>;
};

export type LegacyPricingPlan = {
  plan_slug: string | null;
  display_name: string | null;
  description: string;
  amount_paise: number;
  price_display: string;
  currency: string;
  billing_cycle: string;
  features: string[];
  limits: Record<string, number>;
};

export type FeatureFlagDecision = {
  enabled: boolean;
  featureKey: string;
  updatedAt?: string;
};

export type OnboardingBootstrapPayload = {
  success: true;
  domain: ProductDomain;
  pricing: {
    plans: OnboardingBootstrapPlan[];
  };
  features: {
    onboardingPricingTrialToggle: FeatureFlagDecision;
  };
};

type BootstrapCacheEntry = {
  value: OnboardingBootstrapPayload;
  freshUntil: number;
  staleUntil: number;
};

type FeatureFlagCacheEntry = {
  value: FeatureFlagDecision;
  freshUntil: number;
  staleUntil: number;
};

const bootstrapCache = new Map<ProductDomain, BootstrapCacheEntry>();
const bootstrapInFlight = new Map<ProductDomain, Promise<OnboardingBootstrapPayload>>();
const featureFlagCache = new Map<string, FeatureFlagCacheEntry>();
const featureFlagInFlight = new Map<string, Promise<FeatureFlagDecision>>();

export function __resetOnboardingBootstrapCacheForTests(): void {
  if (process.env.NODE_ENV !== "test") return;
  bootstrapCache.clear();
  bootstrapInFlight.clear();
  featureFlagCache.clear();
  featureFlagInFlight.clear();
}

export function resolveProductDomainFromRequest(
  request: NextRequest,
): ProductDomain {
  const queryDomain = request.nextUrl.searchParams.get("domain")?.trim();
  if (queryDomain) {
    if (!isValidProductDomain(queryDomain)) {
      throw new Error("INVALID_DOMAIN");
    }
    return queryDomain;
  }

  const headerDomain =
    request.headers.get("x-tenant-domain") ||
    request.headers.get("x-product-domain");

  if (headerDomain && isValidProductDomain(headerDomain)) {
    return headerDomain;
  }

  const host = request.headers.get("host") || "";
  const [hostname, explicitPort] = host.split(":");
  const port = explicitPort || request.nextUrl.port;
  return resolveDomain(hostname, port);
}

export function isValidFeatureKey(featureKey: string): boolean {
  return FEATURE_KEY_PATTERN.test(featureKey);
}

export function toLegacyPricingPlans(
  plans: OnboardingBootstrapPlan[],
): LegacyPricingPlan[] {
  return plans.map((plan) => ({
    plan_slug: plan.id,
    display_name: plan.name,
    description: plan.description,
    amount_paise: plan.price,
    price_display: plan.priceDisplay,
    currency: plan.currency,
    billing_cycle: "monthly",
    features: plan.features,
    limits: plan.limits || {},
  }));
}

export async function getOnboardingBootstrapConfig(
  domain: ProductDomain,
): Promise<OnboardingBootstrapPayload> {
  const now = Date.now();
  const cached = bootstrapCache.get(domain);

  if (cached && cached.freshUntil > now) {
    return cached.value;
  }

  const pending = bootstrapInFlight.get(domain);
  if (pending) {
    return pending;
  }

  const request = fetchOnboardingBootstrapConfig(domain, cached, now);
  bootstrapInFlight.set(domain, request);

  try {
    return await request;
  } finally {
    bootstrapInFlight.delete(domain);
  }
}

export async function getFeatureFlagDecision(
  featureKey: string,
): Promise<FeatureFlagDecision> {
  if (!isValidFeatureKey(featureKey)) {
    throw new Error("INVALID_FEATURE_KEY");
  }

  const now = Date.now();
  const cached = featureFlagCache.get(featureKey);

  if (cached && cached.freshUntil > now) {
    return cached.value;
  }

  const pending = featureFlagInFlight.get(featureKey);
  if (pending) {
    return pending;
  }

  const request = fetchFeatureFlagDecision(featureKey, cached, now);
  featureFlagInFlight.set(featureKey, request);

  try {
    return await request;
  } finally {
    featureFlagInFlight.delete(featureKey);
  }
}

async function fetchOnboardingBootstrapConfig(
  domain: ProductDomain,
  cached: BootstrapCacheEntry | undefined,
  now: number,
): Promise<OnboardingBootstrapPayload> {
  try {
    const [plans, onboardingPricingTrialToggle] = await Promise.all([
      fetchPricingPlans(domain),
      getFeatureFlagDecision(ONBOARDING_PRICING_TRIAL_TOGGLE_FLAG),
    ]);

    const value: OnboardingBootstrapPayload = {
      success: true,
      domain,
      pricing: { plans },
      features: { onboardingPricingTrialToggle },
    };

    bootstrapCache.set(domain, {
      value,
      freshUntil: now + FRESH_TTL_MS,
      staleUntil: now + STALE_TTL_MS,
    });

    return value;
  } catch (error) {
    if (cached && cached.staleUntil > now) {
      console.warn("[onboarding/bootstrap] serving_stale_config", {
        domain,
        message: error instanceof Error ? error.message : String(error),
      });
      return cached.value;
    }

    throw error;
  }
}

async function fetchFeatureFlagDecision(
  featureKey: string,
  cached: FeatureFlagCacheEntry | undefined,
  now: number,
): Promise<FeatureFlagDecision> {
  try {
    const supabase = getSupabaseServiceClient({ timeoutMs: SUPABASE_TIMEOUT_MS });
    const { data, error } = await supabase
      .from("feature_flags")
      .select("feature_key, is_enabled_globally, updated_at")
      .eq("feature_key", featureKey)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      const missing = new Error("FLAG_NOT_FOUND");
      missing.name = "FLAG_NOT_FOUND";
      throw missing;
    }

    const row = data as FeatureFlagRow;
    const value: FeatureFlagDecision = {
      enabled: row.is_enabled_globally === true,
      featureKey: row.feature_key,
      updatedAt: row.updated_at || undefined,
    };

    featureFlagCache.set(featureKey, {
      value,
      freshUntil: now + FRESH_TTL_MS,
      staleUntil: now + STALE_TTL_MS,
    });

    return value;
  } catch (error) {
    if (cached && cached.staleUntil > now) {
      console.warn("[feature-flag] serving_stale_flag", {
        featureKey,
        message: error instanceof Error ? error.message : String(error),
      });
      return cached.value;
    }

    throw error;
  }
}

async function fetchPricingPlans(
  domain: ProductDomain,
): Promise<OnboardingBootstrapPlan[]> {
  const supabase = getSupabaseServiceClient({ timeoutMs: SUPABASE_TIMEOUT_MS });
  const { data, error } = await supabase
    .from("pricing_plans")
    .select(
      "plan_slug, display_name, description, amount_paise, currency, billing_cycle, features_json, limits_json",
    )
    .eq("product_domain", domain)
    .eq("billing_cycle", "monthly")
    .eq("is_active", true)
    .is("effective_to", null)
    .order("amount_paise", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data || []) as PricingPlanRow[];
  const plans = rows
    .filter((plan) => typeof plan.plan_slug === "string")
    .map((plan) => {
      const amountPaise = plan.amount_paise || 0;
      const currency = plan.currency || "INR";

      return {
        id: plan.plan_slug as string,
        name: plan.display_name || plan.plan_slug || "",
        priceDisplay: formatPrice(amountPaise, currency),
        description: plan.description || "",
        features: asStringArray(plan.features_json),
        price: amountPaise,
        currency,
        limits: asRecord(plan.limits_json),
      };
    });

  if (plans.length === 0) {
    const missing = new Error(`No active pricing plans are configured for ${domain}`);
    missing.name = "PRICING_NOT_CONFIGURED";
    throw missing;
  }

  return plans;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function asRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

function formatPrice(amountPaise: number, currency = "INR") {
  const symbols: Record<string, string> = {
    INR: "\u20b9",
    USD: "$",
    EUR: "\u20ac",
  };
  const symbol = symbols[currency] || `${currency} `;
  return `${symbol}${(amountPaise / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}
