/**
 * Frontend Pricing Service
 * ========================
 * Fetches domain-specific pricing from the backend API.
 *
 * Enterprise rules:
 * - Domain is resolved server-side from the Host header
 * - Frontend NEVER sends domain to the backend
 * - All pricing data comes from /api/pricing/plans
 * - No hardcoded pricing in frontend code
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

// Types
export interface PricingPlan {
  plan_slug: string;
  display_name: string;
  description: string;
  amount_paise: number;
  price_display: string;
  currency: string;
  billing_cycle: string;
  features: string[];
  limits: Record<string, number>;
}

export interface PricingResponse {
  success: boolean;
  domain: string;
  plans: PricingPlan[];
}

// In-memory cache (per page load)
let _cachedPlans: PricingPlan[] | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch all pricing plans for the current domain.
 *
 * Domain is resolved server-side from the Host header —
 * no domain parameter needed.
 *
 * Results are cached in-memory for 5 minutes.
 */
export async function fetchPricingPlans(): Promise<PricingPlan[]> {
  // Return cached if fresh
  if (_cachedPlans && Date.now() - _cacheTimestamp < CACHE_TTL_MS) {
    return _cachedPlans;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/pricing/plans`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      // credentials: 'include' if you need cookies
    });

    if (!response.ok) {
      console.error(
        `[Pricing] Failed to fetch plans: ${response.status} ${response.statusText}`,
      );
      return _cachedPlans || []; // Return stale cache if available
    }

    const data: PricingResponse = await response.json();

    if (data.success && data.plans) {
      _cachedPlans = data.plans;
      _cacheTimestamp = Date.now();
      console.log(
        `[Pricing] Loaded ${data.plans.length} plans for domain: ${data.domain}`,
      );
      return data.plans;
    }

    console.warn("[Pricing] Unexpected response format:", data);
    return _cachedPlans || [];
  } catch (error) {
    console.error("[Pricing] Network error fetching plans:", error);
    return _cachedPlans || []; // Return stale cache on error
  }
}

/**
 * Fetch a specific plan by slug.
 *
 * @param planSlug - e.g., "starter", "business", "pro"
 */
export async function fetchPlanBySlug(
  planSlug: string,
): Promise<PricingPlan | null> {
  const plans = await fetchPricingPlans();
  return plans.find((p) => p.plan_slug === planSlug) || null;
}

/**
 * Format price for display.
 *
 * @param amountPaise - Amount in paise (e.g., 399900)
 * @param currency - Currency code (default: INR)
 */
export function formatPrice(
  amountPaise: number,
  currency: string = "INR",
): string {
  const symbols: Record<string, string> = {
    INR: "₹",
    USD: "$",
    EUR: "€",
  };
  const symbol = symbols[currency] || `${currency} `;
  const amount = amountPaise / 100;
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}

/**
 * Invalidate the pricing cache.
 * Call when you know pricing has changed (e.g., admin updated prices).
 */
export function invalidatePricingCache(): void {
  _cachedPlans = null;
  _cacheTimestamp = 0;
}
