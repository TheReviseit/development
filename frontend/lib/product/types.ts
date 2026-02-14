/**
 * PRODUCT SYSTEM TYPES
 * =====================
 * Core type definitions for the product registry system.
 * Used across both frontend and backend (via code generation).
 */

// =============================================================================
// PRODUCT DOMAIN
// =============================================================================

/**
 * All product domains in the system.
 * Adding a new product = add it here + add config to registry.ts
 */
export type ProductDomain =
  | "shop"
  | "dashboard"
  | "marketing"
  | "showcase"
  | "api";

// =============================================================================
// PRICING TYPES
// =============================================================================

/**
 * Plan tier identifier (reusable across products)
 */
export type PlanTier = "starter" | "business" | "pro";

/**
 * Billing interval
 */
export type BillingInterval = "monthly" | "yearly";

/**
 * Currency codes
 */
export type Currency = "INR" | "USD" | "EUR";

/**
 * Usage limits for a pricing plan
 */
export interface PricingLimits {
  aiResponses: number;
  whatsappNumbers: number;
  faqs?: number;
  products?: number;
  orders?: number;
  campaigns?: number;
  campaignRecipients?: number;
  showcaseItems?: number;
  apiCalls?: number;
  apiKeys?: number;
  [key: string]: number | undefined;
}

/**
 * Single pricing tier for a product
 */
export interface PricingTier {
  // Unique identifiers
  id: PlanTier;
  planId: string; // Unique: "shop_starter", "dashboard_business", etc.

  // Razorpay/Stripe integration
  razorpayPlanId: string; // From environment variable
  stripeProductId?: string; // For Stripe integration

  // Display information
  name: string;
  price: number; // In smallest currency unit (paise for INR)
  priceDisplay: string; // Formatted: "₹1,999"
  currency: Currency;
  interval: BillingInterval;

  // Marketing
  description: string;
  tagline?: string;
  popular?: boolean;

  // Features & limits
  features: string[];
  limits: PricingLimits;
}

// =============================================================================
// PRODUCT CONFIGURATION
// =============================================================================

/**
 * Feature flags for a product
 */
export interface ProductFeatures {
  // Core features
  ai: boolean;
  analytics: boolean;
  messages: boolean;
  aiSettings: boolean;
  previewBot: boolean;

  // Shop features
  orders: boolean;
  products: boolean;

  // Booking features
  appointments: boolean;
  services: boolean;

  // Showcase features
  showcase: boolean;

  // Marketing features
  campaigns: boolean;
  bulkMessages: boolean;
  templates: boolean;

  // API features
  api: boolean;
}

/**
 * Route configuration for a product
 */
export interface ProductRoutes {
  landing: string;
  onboarding: string;
  dashboard: string;
  pricing: string;
  login?: string;
  signup?: string;
}

/**
 * Complete product configuration
 */
export interface ProductConfig {
  // Identity
  id: ProductDomain;
  name: string;
  domain: string;
  devPort?: number; // For development port-based routing

  // Description
  description: string;
  tagline?: string;

  // Stripe/Razorpay
  stripeProductId?: string; // Stripe Product ID (if using Stripe)

  // Pricing
  pricing: PricingTier[];

  // Features
  enabledFeatures: Array<keyof ProductFeatures>;

  // Routes
  routes: ProductRoutes;

  // SEO
  seoBase?: string; // Canonical base URL
}

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * Product + Plan combination result
 */
export interface ProductPlanPair {
  product: ProductConfig;
  plan: PricingTier;
}

/**
 * Plan selection payload (for API calls)
 */
export interface PlanSelectionPayload {
  planId: string; // Unique plan ID: "shop_starter"
  productId: ProductDomain;
  interval: BillingInterval;
}

/**
 * Subscription creation request
 */
export interface SubscriptionCreateRequest {
  planId: string;
  productId: ProductDomain;
  customerEmail: string;
  customerName?: string;
  customerPhone?: string;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard for ProductDomain
 */
export function isProductDomain(value: string): value is ProductDomain {
  return ["shop", "dashboard", "marketing", "showcase", "api"].includes(value);
}

/**
 * Type guard for PlanTier
 */
export function isPlanTier(value: string): value is PlanTier {
  return ["starter", "business", "pro"].includes(value);
}

/**
 * Type guard for Currency
 */
export function isCurrency(value: string): value is Currency {
  return ["INR", "USD", "EUR"].includes(value);
}
