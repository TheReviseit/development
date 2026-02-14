/**
 * SERVER-SIDE PRICING COMPONENTS
 * ================================
 * React Server Components for rendering pricing.
 * NO client-side domain detection, NO useState, NO useEffect.
 * Pure server-rendered pricing based on middleware headers.
 */

import { getCurrentProduct, getCurrentPricing } from "../product/server";
import type { PricingTier } from "../product/types";

// =============================================================================
// SERVER COMPONENTS
// =============================================================================

/**
 * Get current product's pricing (Server Component helper)
 *
 * Usage:
 * ```tsx
 * import { getCurrentProductPricing } from '@/lib/pricing/server-components';
 *
 * export default async function PricingPage() {
 *   const pricing = await getCurrentProductPricing();
 *   return <div>{pricing.map(plan => ...)}</div>;
 * }
 * ```
 */
export async function getCurrentProductPricing(): Promise<PricingTier[]> {
  return await getCurrentPricing();
}

/**
 * Get product name for display (Server Component helper)
 */
export async function getCurrentProductName(): Promise<string> {
  const product = await getCurrentProduct();
  return product.name;
}

/**
 * Get product tagline for display (Server Component helper)
 */
export async function getCurrentProductTagline(): Promise<string | undefined> {
  const product = await getCurrentProduct();
  return product.tagline;
}

// =============================================================================
// PRICING DATA TRANSFORMERS
// =============================================================================

/**
 * Transform pricing for client components (removes server-only fields)
 *
 * Usage in Server Component:
 * ```tsx
 * import { serializePricingForClient } from '@/lib/pricing/server-components';
 *
 * export default async function Page() {
 *   const pricing = await getCurrentPricing();
 *   const serialized = serializePricingForClient(pricing);
 *
 *   return <ClientComponent plans={serialized} />;
 * }
 * ```
 */
export function serializePricingForClient(pricing: PricingTier[]) {
  return pricing.map((plan) => ({
    // IDs
    id: plan.id,
    planId: plan.planId,

    // Display
    name: plan.name,
    price: plan.price,
    priceDisplay: plan.priceDisplay,
    currency: plan.currency,
    interval: plan.interval,

    // Marketing
    description: plan.description,
    tagline: plan.tagline,
    popular: plan.popular,

    // Features
    features: plan.features,
    limits: plan.limits,

    // Note: razorpayPlanId excluded for security (client doesn't need it)
  }));
}

/**
 * Get serialized pricing for current product (Server Component)
 */
export async function getSerializedPricingForCurrentProduct() {
  const pricing = await getCurrentPricing();
  return serializePricingForClient(pricing);
}
