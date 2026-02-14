/**
 * PRICING ENGINE — Server-Side Pricing Logic
 * ============================================
 * Replaces the old pricing-engine.ts with product-aware logic.
 * All functions now use the product registry as source of truth.
 */

import type { ProductDomain, PricingTier, PlanTier } from "../product/types";
import {
  PRODUCT_REGISTRY,
  getPlanConfig,
  getProductPlans,
  getPlanByTier,
} from "../product/registry";

// =============================================================================
// PRICING RETRIEVAL (Product-Aware)
// =============================================================================

/**
 * Get all pricing plans for a specific product
 *
 * @throws Error if product doesn't exist (fail loud, no fallback)
 */
export function getPricingForProduct(productId: ProductDomain): PricingTier[] {
  const product = PRODUCT_REGISTRY[productId];

  if (!product) {
    throw new Error(
      `Invalid product ID: ${productId}. ` +
        `Valid products: ${Object.keys(PRODUCT_REGISTRY).join(", ")}`,
    );
  }

  return product.pricing;
}

/**
 * Get a specific plan by unique plan ID (e.g., "shop_starter")
 *
 * @throws Error if plan doesn't exist
 */
export function getPlanByPlanId(planId: string): PricingTier {
  const result = getPlanConfig(planId);

  if (!result) {
    throw new Error(
      `Invalid plan ID: ${planId}. ` +
        `Plan IDs must be in format: {product}_{tier}, e.g., "shop_starter"`,
    );
  }

  return result.plan;
}

/**
 * Get plan by product + tier (e.g., "shop" + "starter")
 */
export function getPlanForProductTier(
  productId: ProductDomain,
  tier: PlanTier,
): PricingTier {
  const plan = getPlanByTier(productId, tier);

  if (!plan) {
    throw new Error(`Plan tier "${tier}" not found for product "${productId}"`);
  }

  return plan;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate product + plan combination
 *
 * @throws Error with descriptive message if invalid
 */
export function validateProductPlan(
  productId: ProductDomain,
  planId: string,
): void {
  // Validate product exists
  if (!PRODUCT_REGISTRY[productId]) {
    throw new Error(`Invalid product: ${productId}`);
  }

  // Validate plan exists globally
  const result = getPlanConfig(planId);
  if (!result) {
    throw new Error(`Invalid plan: ${planId}`);
  }

  // Validate plan belongs to this product
  if (result.product.id !== productId) {
    throw new Error(
      `Plan "${planId}" belongs to product "${result.product.id}", ` +
        `not "${productId}"`,
    );
  }
}

/**
 * Check if plan is available for product (returns boolean, doesn't throw)
 */
export function isPlanAvailableForProduct(
  productId: ProductDomain,
  planId: string,
): boolean {
  try {
    validateProductPlan(productId, planId);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// PRICING CALCULATIONS
// =============================================================================

/**
 * Calculate prorated amount for plan upgrade/downgrade
 */
export function calculateProration(
  currentPlan: PricingTier,
  newPlan: PricingTier,
  daysRemaining: number,
): {
  amount: number;
  isUpgrade: boolean;
  description: string;
} {
  const daysInMonth = 30;
  const currentDailyRate = currentPlan.price / daysInMonth;
  const newDailyRate = newPlan.price / daysInMonth;

  const currentRemaining = currentDailyRate * daysRemaining;
  const newRemaining = newDailyRate * daysRemaining;
  const proratedAmount = newRemaining - currentRemaining;

  const isUpgrade = newPlan.price > currentPlan.price;

  return {
    amount: Math.round(proratedAmount),
    isUpgrade,
    description: isUpgrade
      ? `Upgrade from ${currentPlan.name} to ${newPlan.name} (${daysRemaining} days remaining)`
      : `Downgrade from ${currentPlan.name} to ${newPlan.name} (credited for ${daysRemaining} days)`,
  };
}

/**
 * Calculate annual discount (typically 20%)
 */
export function calculateAnnualPrice(
  monthlyPrice: number,
  discountPercent: number = 20,
): number {
  const annualPrice = monthlyPrice * 12;
  const discount = annualPrice * (discountPercent / 100);
  return Math.round(annualPrice - discount);
}

/**
 * Get monthly equivalent of annual price
 */
export function getMonthlyEquivalent(annualPrice: number): number {
  return Math.round(annualPrice / 12);
}

// =============================================================================
// PLAN RECOMMENDATIONS
// =============================================================================

/**
 * Recommend a plan based on usage metrics
 */
export function getRecommendedPlan(
  productId: ProductDomain,
  usage: {
    aiResponses?: number;
    whatsappNumbers?: number;
    products?: number;
    campaigns?: number;
    apiCalls?: number;
  },
): PlanTier {
  const plans = getPricingForProduct(productId);

  // Find the smallest plan that fits the usage
  for (const plan of plans) {
    const fitsAIResponses =
      plan.limits.aiResponses === -1 ||
      (usage.aiResponses || 0) <= plan.limits.aiResponses;

    const fitsWhatsAppNumbers =
      plan.limits.whatsappNumbers === -1 ||
      (usage.whatsappNumbers || 0) <= plan.limits.whatsappNumbers;

    const fitsProducts =
      !plan.limits.products ||
      plan.limits.products === -1 ||
      (usage.products || 0) <= plan.limits.products;

    const fitsCampaigns =
      !plan.limits.campaigns ||
      plan.limits.campaigns === -1 ||
      (usage.campaigns || 0) <= plan.limits.campaigns;

    const fitsApiCalls =
      !plan.limits.apiCalls ||
      plan.limits.apiCalls === -1 ||
      (usage.apiCalls || 0) <= plan.limits.apiCalls;

    if (
      fitsAIResponses &&
      fitsWhatsAppNumbers &&
      fitsProducts &&
      fitsCampaigns &&
      fitsApiCalls
    ) {
      return plan.id;
    }
  }

  // If no plan fits, recommend the highest tier
  return "pro";
}

/**
 * Get next tier plan (for upsell suggestions)
 */
export function getNextTierPlan(
  productId: ProductDomain,
  currentTier: PlanTier,
): PricingTier | null {
  const plans = getPricingForProduct(productId);
  const currentIndex = plans.findIndex((p) => p.id === currentTier);

  if (currentIndex === -1 || currentIndex === plans.length - 1) {
    return null; // Already on highest tier
  }

  return plans[currentIndex + 1];
}

// =============================================================================
// FORMATTING HELPERS
// =============================================================================

/**
 * Format price with currency symbol
 */
export function formatPrice(amount: number, currency: string = "INR"): string {
  const symbols: Record<string, string> = {
    INR: "₹",
    USD: "$",
    EUR: "€",
  };

  const symbol = symbols[currency] || currency;

  // Amount is in paise (INR) or cents (USD), convert to rupees/dollars
  const mainAmount = amount / 100;

  return `${symbol}${mainAmount.toLocaleString("en-IN")}`;
}

/**
 * Format price range for comparison
 */
export function getPriceRange(productId: ProductDomain): {
  min: string;
  max: string;
  currency: string;
} {
  const plans = getPricingForProduct(productId);
  const prices = plans.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const currency = plans[0].currency;

  return {
    min: formatPrice(min, currency),
    max: formatPrice(max, currency),
    currency,
  };
}

// =============================================================================
// FEATURE COMPARISON
// =============================================================================

/**
 * Get features unique to a plan (not in lower tiers)
 */
export function getUniqueFeatures(
  productId: ProductDomain,
  tier: PlanTier,
): string[] {
  const plans = getPricingForProduct(productId);
  const planIndex = plans.findIndex((p) => p.id === tier);

  if (planIndex === -1) return [];

  const currentPlan = plans[planIndex];
  const lowerTierFeatures = new Set<string>();

  // Collect features from lower tiers
  for (let i = 0; i < planIndex; i++) {
    plans[i].features.forEach((f) => lowerTierFeatures.add(f));
  }

  // Return features unique to this plan
  return currentPlan.features.filter((f) => !lowerTierFeatures.has(f));
}

/**
 * Compare two plans and return differences
 */
export function comparePlans(
  planAId: string,
  planBId: string,
): {
  priceDifference: number;
  featuresDifference: string[];
  limitsDifference: Record<string, { planA: number; planB: number }>;
} {
  const planA = getPlanByPlanId(planAId);
  const planB = getPlanByPlanId(planBId);

  // Price difference
  const priceDifference = planB.price - planA.price;

  // Feature differences
  const featuresA = new Set(planA.features);
  const featuresB = new Set(planB.features);
  const featuresDifference = Array.from(featuresB).filter(
    (f) => !featuresA.has(f),
  );

  // Limits comparison
  const limitsDifference: Record<string, { planA: number; planB: number }> = {};
  const allLimitKeys = new Set([
    ...Object.keys(planA.limits),
    ...Object.keys(planB.limits),
  ]);

  allLimitKeys.forEach((key) => {
    const valueA = planA.limits[key] || 0;
    const valueB = planB.limits[key] || 0;
    if (valueA !== valueB) {
      limitsDifference[key] = { planA: valueA, planB: valueB };
    }
  });

  return {
    priceDifference,
    featuresDifference,
    limitsDifference,
  };
}

// =============================================================================
// BACKWARD COMPATIBILITY (Legacy API)
// =============================================================================

/**
 * @deprecated Use getPricingForProduct() instead
 * Legacy function for backward compatibility with old code
 */
export function getPricingForDomain(domain: ProductDomain) {
  return {
    plans: getPricingForProduct(domain),
    product: PRODUCT_REGISTRY[domain],
  };
}
