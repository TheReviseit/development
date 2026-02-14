/**
 * PRODUCT REGISTRY — Single Source of Truth
 * ===========================================
 * This file defines ALL products in the system.
 * Adding a new product = edit this file only.
 *
 * CRITICAL: Keep in sync with backend/config/products.py
 */

import type {
  ProductDomain,
  ProductConfig,
  PricingTier,
  PlanTier,
  ProductPlanPair,
} from "./types";

// =============================================================================
// ENVIRONMENT VARIABLE VALIDATION
// =============================================================================

/**
 * Get environment variable if available, or return a silent placeholder.
 *
 * NOTE: Since the pricing refactor, Razorpay plan IDs are stored in the
 * `pricing_plans` database table and resolved server-side from the Host
 * header. These env vars are no longer required for subscription creation.
 * The field is kept for backward compatibility with components that read it.
 */
function requireEnv(key: string, _productPlan: string): string {
  const value = process.env[key];
  if (!value) {
    // Silent placeholder — plan IDs now come from backend DB
    return `DB_RESOLVED_${key}`;
  }
  return value;
}

// =============================================================================
// REUSABLE PRICING TIER TEMPLATES
// =============================================================================

/**
 * Creates a starter tier pricing configuration
 */
function createStarterTier(
  productId: ProductDomain,
  price: number,
  features: string[],
  limits: PricingTier["limits"],
  options?: { description?: string; tagline?: string },
): PricingTier {
  const envKey = `NEXT_PUBLIC_RAZORPAY_PLAN_${productId.toUpperCase()}_STARTER`;

  return {
    id: "starter",
    planId: `${productId}_starter`,
    razorpayPlanId: requireEnv(envKey, `${productId}/starter`),
    name: "Starter",
    price,
    priceDisplay: `₹${(price / 100).toLocaleString("en-IN")}`,
    currency: "INR",
    interval: "monthly",
    description: options?.description || "Perfect for getting started",
    tagline: options?.tagline,
    popular: false,
    features,
    limits,
  };
}

/**
 * Creates a business tier pricing configuration
 */
function createBusinessTier(
  productId: ProductDomain,
  price: number,
  features: string[],
  limits: PricingTier["limits"],
  options?: { description?: string; tagline?: string },
): PricingTier {
  const envKey = `NEXT_PUBLIC_RAZORPAY_PLAN_${productId.toUpperCase()}_BUSINESS`;

  return {
    id: "business",
    planId: `${productId}_business`,
    razorpayPlanId: requireEnv(envKey, `${productId}/business`),
    name: "Business",
    price,
    priceDisplay: `₹${(price / 100).toLocaleString("en-IN")}`,
    currency: "INR",
    interval: "monthly",
    description: options?.description || "For growing businesses",
    tagline: options?.tagline,
    popular: true, // Business tier is usually most popular
    features,
    limits,
  };
}

/**
 * Creates a pro tier pricing configuration
 */
function createProTier(
  productId: ProductDomain,
  price: number,
  features: string[],
  limits: PricingTier["limits"],
  options?: { description?: string; tagline?: string },
): PricingTier {
  const envKey = `NEXT_PUBLIC_RAZORPAY_PLAN_${productId.toUpperCase()}_PRO`;

  return {
    id: "pro",
    planId: `${productId}_pro`,
    razorpayPlanId: requireEnv(envKey, `${productId}/pro`),
    name: "Pro",
    price,
    priceDisplay: `₹${(price / 100).toLocaleString("en-IN")}`,
    currency: "INR",
    interval: "monthly",
    description: options?.description || "Advanced features + unlimited scale",
    tagline: options?.tagline,
    popular: false,
    features,
    limits,
  };
}

// =============================================================================
// PRODUCT REGISTRY
// =============================================================================

export const PRODUCT_REGISTRY: Record<ProductDomain, ProductConfig> = {
  // ===========================================================================
  // SHOP PRODUCT
  // ===========================================================================
  shop: {
    id: "shop",
    name: "Flowauxi Shop",
    domain: "shop.flowauxi.com",
    devPort: 3001,
    description: "WhatsApp Commerce Platform",
    tagline: "Sell products via WhatsApp with AI automation",

    pricing: [
      createStarterTier(
        "shop",
        199900, // ₹1,999
        [
          "Domain: Random domain name (e.g. store/abc1234)",
          "10 products (incl. variants)",
          "Standard invoice",
          "10 email invoices",
          "10 live order updates via email",
          "Normal Dashboard",
          "Message inbox",
          "Up to 10 days message history",
          "Email support",
        ],
        {
          aiResponses: 1000,
          whatsappNumbers: 1,
          faqs: 30,
          products: 10,
          orders: 100,
        },
        {
          description: "Perfect for getting started with your online store",
          tagline: "Everything you need to launch...",
        },
      ),

      createBusinessTier(
        "shop",
        399900, // ₹3,999
        [
          "Custom domain name (store/yourstorename)",
          "50 products (incl. variants)",
          "50 live order updates (Email & WhatsApp)",
          "Get order updates in Google Sheets (up to 50 orders)",
          "Invoice customization",
          "Analytics dashboard",
          "Message inbox",
          "Up to 50 days message history",
          "Email and call support",
        ],
        {
          aiResponses: 5000,
          whatsappNumbers: 1,
          faqs: 100,
          products: 50,
          orders: 500,
        },
        {
          description: "For growing businesses",
          tagline: "Everything in Basic plus...",
        },
      ),

      createProTier(
        "shop",
        699900, // ₹6,999
        [
          "Custom domain name (store/yourstorename)",
          "100 products",
          "100 live order updates (Email & WhatsApp)",
          "Get order updates in Google Sheets",
          "Invoice customization",
          "Analytics dashboard",
          "Message inbox",
          "No limit message history",
          "Email and call support",
        ],
        {
          aiResponses: 15000,
          whatsappNumbers: 2,
          faqs: -1, // unlimited
          products: 100,
          orders: -1, // unlimited
        },
        {
          description: "Advanced features + unlimited users",
          tagline: "Everything in Business plus...",
        },
      ),
    ],

    enabledFeatures: ["orders", "products", "ai", "analytics", "messages"],

    routes: {
      landing: "/shop",
      onboarding: "/onboarding-embedded",
      dashboard: "/dashboard",
      pricing: "/pricing",
      login: "/login",
      signup: "/signup",
    },

    seoBase: "https://shop.flowauxi.com",
  },

  // ===========================================================================
  // DASHBOARD PRODUCT (Full WhatsApp Automation)
  // ===========================================================================
  dashboard: {
    id: "dashboard",
    name: "WhatsApp AI Automation",
    domain: "flowauxi.com",
    devPort: 3000,
    description: "Full-featured WhatsApp automation platform",
    tagline: "AI-powered WhatsApp automation for business",

    pricing: [
      createStarterTier(
        "dashboard",
        149900, // ₹1,499
        [
          "2,500 AI Responses / month",
          "1 WhatsApp Number",
          "Up to 50 FAQs Training",
          "Basic Auto-Replies",
          "Live Chat Dashboard",
          "Email Support",
        ],
        {
          aiResponses: 2500,
          whatsappNumbers: 1,
          faqs: 50,
        },
        {
          description: "Perfect for solo entrepreneurs",
          tagline: "Best for 80-100 queries/day",
        },
      ),

      createBusinessTier(
        "dashboard",
        399900, // ₹3,999
        [
          "8,000 AI Responses / month",
          "Up to 2 WhatsApp Numbers",
          "Up to 200 FAQs Training",
          "Broadcast Campaigns",
          "Template Message Builder",
          "Contact Management",
          "Basic Analytics Dashboard",
          "Chat Support",
        ],
        {
          aiResponses: 8000,
          whatsappNumbers: 2,
          faqs: 200,
        },
        {
          description: "For growing businesses",
          tagline: "Best for 250-300 queries/day",
        },
      ),

      createProTier(
        "dashboard",
        899900, // ₹8,999
        [
          "25,000 AI Responses / month",
          "Unlimited WhatsApp Numbers",
          "Unlimited FAQs Training",
          "Custom AI Personality Training",
          "Multi-Agent Team Inbox",
          "Advanced Workflow Automation",
          "API Access & Webhooks",
          "Advanced Analytics & Reports",
          "Priority Support + Onboarding",
        ],
        {
          aiResponses: 25000,
          whatsappNumbers: -1, // unlimited
          faqs: -1, // unlimited
        },
        {
          description: "Full automation power",
          tagline: "Best for 650+ queries/day",
        },
      ),
    ],

    enabledFeatures: [
      "ai",
      "analytics",
      "messages",
      "aiSettings",
      "orders",
      "products",
      "appointments",
      "services",
      "showcase",
    ],

    routes: {
      landing: "/",
      onboarding: "/onboarding-embedded",
      dashboard: "/dashboard",
      pricing: "/pricing",
      login: "/login",
      signup: "/signup",
    },

    seoBase: "https://flowauxi.com",
  },

  // ===========================================================================
  // MARKETING PRODUCT
  // ===========================================================================
  marketing: {
    id: "marketing",
    name: "WhatsApp Marketing Automation",
    domain: "marketing.flowauxi.com",
    devPort: 3002,
    description: "Campaign management and bulk messaging",
    tagline: "Scale your WhatsApp marketing campaigns",

    pricing: [
      createStarterTier(
        "marketing",
        199900, // ₹1,999
        [
          "3,000 AI Responses / month",
          "1 WhatsApp Number",
          "Up to 5 Broadcast Campaigns",
          "500 Recipients per Campaign",
          "Basic Template Builder",
          "Message Scheduling",
          "Email Support",
        ],
        {
          aiResponses: 3000,
          whatsappNumbers: 1,
          faqs: 50,
          campaigns: 5,
          campaignRecipients: 500,
        },
        {
          description: "For small marketing campaigns",
        },
      ),

      createBusinessTier(
        "marketing",
        499900, // ₹4,999
        [
          "10,000 AI Responses / month",
          "Up to 2 WhatsApp Numbers",
          "Unlimited Broadcast Campaigns",
          "5,000 Recipients per Campaign",
          "Advanced Template Builder",
          "Campaign Analytics",
          "A/B Testing",
          "Priority Support",
        ],
        {
          aiResponses: 10000,
          whatsappNumbers: 2,
          faqs: 150,
          campaigns: -1, // unlimited
          campaignRecipients: 5000,
        },
        {
          description: "For professional marketers",
        },
      ),

      createProTier(
        "marketing",
        999900, // ₹9,999
        [
          "30,000 AI Responses / month",
          "Unlimited WhatsApp Numbers",
          "Unlimited Broadcast Campaigns",
          "Unlimited Recipients",
          "Custom Templates & Branding",
          "Advanced Campaign Analytics",
          "Multi-Campaign A/B Testing",
          "API Access",
          "Dedicated Account Manager",
        ],
        {
          aiResponses: 30000,
          whatsappNumbers: -1,
          faqs: -1,
          campaigns: -1,
          campaignRecipients: -1,
        },
        {
          description: "Enterprise marketing power",
        },
      ),
    ],

    enabledFeatures: [
      "ai",
      "messages",
      "campaigns",
      "bulkMessages",
      "templates",
      "analytics",
    ],

    routes: {
      landing: "/marketing",
      onboarding: "/onboarding-embedded",
      dashboard: "/dashboard",
      pricing: "/pricing",
      login: "/login",
      signup: "/signup",
    },

    seoBase: "https://marketing.flowauxi.com",
  },

  // ===========================================================================
  // SHOWCASE PRODUCT
  // ===========================================================================
  showcase: {
    id: "showcase",
    name: "WhatsApp Showcase",
    domain: "pages.flowauxi.com",
    devPort: 3003,
    description: "Portfolio and showcase platform",
    tagline: "Beautiful portfolios powered by WhatsApp",

    pricing: [
      createStarterTier(
        "showcase",
        99900, // ₹999
        [
          "1,500 AI Responses / month",
          "1 WhatsApp Number",
          "Up to 10 Portfolio Items",
          "Basic Showcase Page",
          "Contact Form Integration",
          "Email Support",
        ],
        {
          aiResponses: 1500,
          whatsappNumbers: 1,
          faqs: 30,
          showcaseItems: 10,
        },
        {
          description: "Perfect for freelancers",
        },
      ),

      createBusinessTier(
        "showcase",
        299900, // ₹2,999
        [
          "5,000 AI Responses / month",
          "Up to 2 WhatsApp Numbers",
          "Up to 50 Portfolio Items",
          "Custom Showcase Design",
          "Gallery & Media Support",
          "Analytics Dashboard",
          "Priority Support",
        ],
        {
          aiResponses: 5000,
          whatsappNumbers: 2,
          faqs: 100,
          showcaseItems: 50,
        },
        {
          description: "For professional portfolios",
        },
      ),

      createProTier(
        "showcase",
        599900, // ₹5,999
        [
          "15,000 AI Responses / month",
          "Unlimited WhatsApp Numbers",
          "Unlimited Portfolio Items",
          "Premium Custom Design",
          "Video & Rich Media",
          "Advanced Analytics",
          "Client Management",
          "API Access",
        ],
        {
          aiResponses: 15000,
          whatsappNumbers: -1,
          faqs: -1,
          showcaseItems: -1,
        },
        {
          description: "Premium showcase experience",
        },
      ),
    ],

    enabledFeatures: ["ai", "messages", "showcase", "analytics"],

    routes: {
      landing: "/showcase",
      onboarding: "/onboarding-embedded",
      dashboard: "/dashboard",
      pricing: "/pricing",
      login: "/login",
      signup: "/signup",
    },

    seoBase: "https://pages.flowauxi.com",
  },

  // ===========================================================================
  // API PRODUCT
  // ===========================================================================
  api: {
    id: "api",
    name: "WhatsApp API",
    domain: "api.flowauxi.com",
    devPort: 3004,
    description: "Developer API and integrations",
    tagline: "Build on top of WhatsApp with our API",

    pricing: [
      createStarterTier(
        "api",
        149900, // ₹1,499
        [
          "10,000 API Calls / month",
          "1 API Key",
          "Basic Webhooks",
          "Standard Rate Limits",
          "Community Support",
          "API Documentation",
        ],
        {
          aiResponses: 10000,
          whatsappNumbers: 1,
          faqs: 0,
          apiCalls: 10000,
          apiKeys: 1,
        },
        {
          description: "For individual developers",
        },
      ),

      createBusinessTier(
        "api",
        499900, // ₹4,999
        [
          "100,000 API Calls / month",
          "Up to 5 API Keys",
          "Advanced Webhooks",
          "Higher Rate Limits",
          "Priority Support",
          "Custom Integration Help",
        ],
        {
          aiResponses: 100000,
          whatsappNumbers: 5,
          faqs: 0,
          apiCalls: 100000,
          apiKeys: 5,
        },
        {
          description: "For growing applications",
        },
      ),

      createProTier(
        "api",
        1499900, // ₹14,999
        [
          "Unlimited API Calls",
          "Unlimited API Keys",
          "Custom Webhooks",
          "No Rate Limits",
          "99.99% SLA",
          "Dedicated Support",
          "Custom Integrations",
        ],
        {
          aiResponses: -1,
          whatsappNumbers: -1,
          faqs: 0,
          apiCalls: -1,
          apiKeys: -1,
        },
        {
          description: "For enterprise applications",
        },
      ),
    ],

    enabledFeatures: ["api"],

    routes: {
      landing: "/apis",
      onboarding: "/console/signup",
      dashboard: "/console",
      pricing: "/pricing",
      login: "/console/login",
      signup: "/console/signup",
    },

    seoBase: "https://api.flowauxi.com",
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get product config by domain (hostname or subdomain)
 */
export function getProductByDomain(
  hostname: string,
  port?: string,
): ProductConfig {
  // Production: exact hostname match
  for (const product of Object.values(PRODUCT_REGISTRY)) {
    if (hostname === product.domain || hostname === `www.${product.domain}`) {
      return product;
    }
  }

  // Production: subdomain prefix match
  for (const product of Object.values(PRODUCT_REGISTRY)) {
    const subdomain = product.domain.split(".")[0];
    if (hostname.startsWith(`${subdomain}.`)) {
      return product;
    }
  }

  // Development: port-based routing
  if (
    port &&
    (hostname.includes("localhost") || hostname.includes("127.0.0.1"))
  ) {
    for (const product of Object.values(PRODUCT_REGISTRY)) {
      if (product.devPort?.toString() === port) {
        return product;
      }
    }
  }

  // Default to dashboard
  return PRODUCT_REGISTRY.dashboard;
}

/**
 * Get plan config by unique plan ID (e.g., "shop_starter")
 */
export function getPlanConfig(planId: string): ProductPlanPair | null {
  for (const product of Object.values(PRODUCT_REGISTRY)) {
    const plan = product.pricing.find((p) => p.planId === planId);
    if (plan) {
      return { product, plan };
    }
  }
  return null;
}

/**
 * Validate that a plan belongs to a product
 */
export function isValidProductPlan(
  productId: ProductDomain,
  planId: string,
): boolean {
  const product = PRODUCT_REGISTRY[productId];
  if (!product) return false;
  return product.pricing.some((p) => p.planId === planId);
}

/**
 * Get all plans for a product
 */
export function getProductPlans(productId: ProductDomain): PricingTier[] {
  const product = PRODUCT_REGISTRY[productId];
  return product?.pricing || [];
}

/**
 * Get plan by tier within a product (e.g., "shop" + "starter")
 */
export function getPlanByTier(
  productId: ProductDomain,
  tier: PlanTier,
): PricingTier | null {
  const product = PRODUCT_REGISTRY[productId];
  return product?.pricing.find((p) => p.id === tier) || null;
}

/**
 * Get list of all product IDs
 */
export function getAllProductIds(): ProductDomain[] {
  return Object.keys(PRODUCT_REGISTRY) as ProductDomain[];
}

/**
 * Validate product ID exists
 */
export function isValidProductId(
  productId: string,
): productId is ProductDomain {
  return productId in PRODUCT_REGISTRY;
}
