/**
 * Domain-Based Pricing Configuration
 * ====================================
 * Single source of truth for all pricing across all domains.
 *
 * This configuration drives pricing display in:
 * - Onboarding flow
 * - Pricing pages
 * - Dashboard subscription management
 * - Payment processing
 */

import type { ProductDomain } from "../domain/config";

// Re-export ProductDomain for convenience
export type { ProductDomain };

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type PlanTier = "starter" | "business" | "pro";

export interface PricingLimit {
  aiResponses: number;
  whatsappNumbers: number;
  faqs: number;
  // Domain-specific limits can be added here
  [key: string]: number;
}

export interface DomainPricingTier {
  id: PlanTier;
  name: string;
  price: number;
  priceDisplay: string;
  currency: string;
  description: string;
  tagline?: string;
  popular?: boolean;
  features: string[];
  limits: PricingLimit;
}

export interface DomainPricingConfig {
  domain: ProductDomain;
  displayName: string;
  plans: DomainPricingTier[];
  enabledFeatures: string[]; // Features available for this domain
  highlightedFeatures: string[]; // Features to emphasize in UI
}

// =============================================================================
// PRICING CONFIGURATION PER DOMAIN
// =============================================================================

/**
 * Dashboard Domain - Full Feature Set
 * All features across all domains
 */
const DASHBOARD_PRICING: DomainPricingConfig = {
  domain: "dashboard",
  displayName: "WhatsApp AI Automation",
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
  highlightedFeatures: ["ai", "analytics", "messages"],
  plans: [
    {
      id: "starter",
      name: "Starter",
      price: 1499,
      priceDisplay: "₹1,499",
      currency: "INR",
      description: "Perfect for solo entrepreneurs",
      tagline: "Best for 80-100 queries/day",
      features: [
        "2,500 AI Responses / month",
        "1 WhatsApp Number",
        "Up to 50 FAQs Training",
        "Basic Auto-Replies",
        "Live Chat Dashboard",
        "Email Support",
      ],
      limits: {
        aiResponses: 2500,
        whatsappNumbers: 1,
        faqs: 50,
      },
    },
    {
      id: "business",
      name: "Business",
      price: 3999,
      priceDisplay: "₹3,999",
      currency: "INR",
      description: "For growing businesses",
      tagline: "Best for 250-300 queries/day",
      popular: true,
      features: [
        "8,000 AI Responses / month",
        "Up to 2 WhatsApp Numbers",
        "Up to 200 FAQs Training",
        "Broadcast Campaigns",
        "Template Message Builder",
        "Contact Management",
        "Basic Analytics Dashboard",
        "Chat Support",
      ],
      limits: {
        aiResponses: 8000,
        whatsappNumbers: 2,
        faqs: 200,
      },
    },
    {
      id: "pro",
      name: "Pro",
      price: 8999,
      priceDisplay: "₹8,999",
      currency: "INR",
      description: "Full automation power",
      tagline: "Best for 650+ queries/day",
      features: [
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
      limits: {
        aiResponses: 25000,
        whatsappNumbers: -1, // -1 = unlimited
        faqs: -1,
      },
    },
  ],
};

/**
 * Shop Domain - E-commerce Focus
 * Emphasizes product management and order processing
 */
const SHOP_PRICING: DomainPricingConfig = {
  domain: "shop",
  displayName: "WhatsApp Shop Automation",
  enabledFeatures: ["ai", "messages", "orders", "products", "analytics"],
  highlightedFeatures: ["orders", "products", "ai"],
  plans: [
    {
      id: "starter",
      name: "Basic Plan",
      price: 1999,
      priceDisplay: "₹1,999",
      currency: "INR",
      description: "Perfect for getting started with your online store",
      tagline: "Everything you need to launch...",
      features: [
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
      limits: {
        aiResponses: 1000,
        whatsappNumbers: 1,
        faqs: 30,
        products: 10,
        orders: 100,
      },
    },
    {
      id: "business",
      name: "Business Plan",
      price: 3999,
      priceDisplay: "₹3,999",
      currency: "INR",
      description: "For growing businesses",
      tagline: "Everything in Basic plus...",
      popular: true,
      features: [
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
      limits: {
        aiResponses: 5000,
        whatsappNumbers: 1,
        faqs: 100,
        products: 50,
        orders: 500,
      },
    },
    {
      id: "pro",
      name: "Enterprise Plan",
      price: 6999,
      priceDisplay: "₹6,999",
      currency: "INR",
      description: "Advanced features + unlimited users",
      tagline: "Everything in Business plus...",
      features: [
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
      limits: {
        aiResponses: 15000,
        whatsappNumbers: 2,
        faqs: -1,
        products: 100,
        orders: -1,
      },
    },
  ],
};

/**
 * Marketing Domain - Campaign Management Focus
 * Emphasizes broadcast campaigns and templates
 */
const MARKETING_PRICING: DomainPricingConfig = {
  domain: "marketing",
  displayName: "WhatsApp Marketing Automation",
  enabledFeatures: [
    "ai",
    "messages",
    "campaigns",
    "bulkMessages",
    "templates",
    "analytics",
  ],
  highlightedFeatures: ["campaigns", "bulkMessages", "templates"],
  plans: [
    {
      id: "starter",
      name: "Starter",
      price: 1999,
      priceDisplay: "₹1,999",
      currency: "INR",
      description: "For small marketing campaigns",
      features: [
        "3,000 AI Responses / month",
        "1 WhatsApp Number",
        "Up to 5 Broadcast Campaigns",
        "500 Recipients per Campaign",
        "Basic Template Builder",
        "Message Scheduling",
        "Email Support",
      ],
      limits: {
        aiResponses: 3000,
        whatsappNumbers: 1,
        faqs: 50,
        campaigns: 5,
        campaignRecipients: 500,
      },
    },
    {
      id: "business",
      name: "Business",
      price: 4999,
      priceDisplay: "₹4,999",
      currency: "INR",
      description: "For professional marketers",
      popular: true,
      features: [
        "10,000 AI Responses / month",
        "Up to 2 WhatsApp Numbers",
        "Unlimited Broadcast Campaigns",
        "5,000 Recipients per Campaign",
        "Advanced Template Builder",
        "Campaign Analytics",
        "A/B Testing",
        "Priority Support",
      ],
      limits: {
        aiResponses: 10000,
        whatsappNumbers: 2,
        faqs: 150,
        campaigns: -1,
        campaignRecipients: 5000,
      },
    },
    {
      id: "pro",
      name: "Pro",
      price: 9999,
      priceDisplay: "₹9,999",
      currency: "INR",
      description: "Enterprise marketing power",
      features: [
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
      limits: {
        aiResponses: 30000,
        whatsappNumbers: -1,
        faqs: -1,
        campaigns: -1,
        campaignRecipients: -1,
      },
    },
  ],
};

/**
 * Showcase Domain - Portfolio/Display Focus
 * Emphasizes showcase and portfolio features
 */
const SHOWCASE_PRICING: DomainPricingConfig = {
  domain: "showcase",
  displayName: "WhatsApp Showcase",
  enabledFeatures: ["ai", "messages", "showcase", "analytics"],
  highlightedFeatures: ["showcase", "ai"],
  plans: [
    {
      id: "starter",
      name: "Starter",
      price: 999,
      priceDisplay: "₹999",
      currency: "INR",
      description: "Perfect for freelancers",
      features: [
        "1,500 AI Responses / month",
        "1 WhatsApp Number",
        "Up to 10 Portfolio Items",
        "Basic Showcase Page",
        "Contact Form Integration",
        "Email Support",
      ],
      limits: {
        aiResponses: 1500,
        whatsappNumbers: 1,
        faqs: 30,
        showcaseItems: 10,
      },
    },
    {
      id: "business",
      name: "Business",
      price: 2999,
      priceDisplay: "₹2,999",
      currency: "INR",
      description: "For professional portfolios",
      popular: true,
      features: [
        "5,000 AI Responses / month",
        "Up to 2 WhatsApp Numbers",
        "Up to 50 Portfolio Items",
        "Custom Showcase Design",
        "Gallery & Media Support",
        "Analytics Dashboard",
        "Priority Support",
      ],
      limits: {
        aiResponses: 5000,
        whatsappNumbers: 2,
        faqs: 100,
        showcaseItems: 50,
      },
    },
    {
      id: "pro",
      name: "Pro",
      price: 5999,
      priceDisplay: "₹5,999",
      currency: "INR",
      description: "Premium showcase experience",
      features: [
        "15,000 AI Responses / month",
        "Unlimited WhatsApp Numbers",
        "Unlimited Portfolio Items",
        "Premium Custom Design",
        "Video & Rich Media",
        "Advanced Analytics",
        "Client Management",
        "API Access",
      ],
      limits: {
        aiResponses: 15000,
        whatsappNumbers: -1,
        faqs: -1,
        showcaseItems: -1,
      },
    },
  ],
};

/**
 * API Domain - Developer/Integration Focus
 * Emphasizes API access and webhooks
 */
const API_PRICING: DomainPricingConfig = {
  domain: "api",
  displayName: "WhatsApp API",
  enabledFeatures: ["api"],
  highlightedFeatures: ["api"],
  plans: [
    {
      id: "starter",
      name: "Developer",
      price: 1499,
      priceDisplay: "₹1,499",
      currency: "INR",
      description: "For individual developers",
      features: [
        "10,000 API Calls / month",
        "1 API Key",
        "Basic Webhooks",
        "Standard Rate Limits",
        "Community Support",
        "API Documentation",
      ],
      limits: {
        aiResponses: 10000,
        whatsappNumbers: 1,
        faqs: 0,
        apiCalls: 10000,
        apiKeys: 1,
      },
    },
    {
      id: "business",
      name: "Growth",
      price: 4999,
      priceDisplay: "₹4,999",
      currency: "INR",
      description: "For growing applications",
      popular: true,
      features: [
        "100,000 API Calls / month",
        "Up to 5 API Keys",
        "Advanced Webhooks",
        "Higher Rate Limits",
        "Priority Support",
        "Custom Integration Help",
      ],
      limits: {
        aiResponses: 100000,
        whatsappNumbers: 5,
        faqs: 0,
        apiCalls: 100000,
        apiKeys: 5,
      },
    },
    {
      id: "pro",
      name: "Enterprise",
      price: 14999,
      priceDisplay: "₹14,999",
      currency: "INR",
      description: "For enterprise applications",
      features: [
        "Unlimited API Calls",
        "Unlimited API Keys",
        "Custom Webhooks",
        "No Rate Limits",
        "99.99% SLA",
        "Dedicated Support",
        "Custom Integrations",
      ],
      limits: {
        aiResponses: -1,
        whatsappNumbers: -1,
        faqs: 0,
        apiCalls: -1,
        apiKeys: -1,
      },
    },
  ],
};

// =============================================================================
// PRICING REGISTRY
// =============================================================================

export const DOMAIN_PRICING: Record<ProductDomain, DomainPricingConfig> = {
  dashboard: DASHBOARD_PRICING,
  shop: SHOP_PRICING,
  marketing: MARKETING_PRICING,
  showcase: SHOWCASE_PRICING,
  api: API_PRICING,
};

// =============================================================================
// EXPORTS
// =============================================================================

export {
  DASHBOARD_PRICING,
  SHOP_PRICING,
  MARKETING_PRICING,
  SHOWCASE_PRICING,
  API_PRICING,
};
