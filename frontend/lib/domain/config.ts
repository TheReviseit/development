/**
 * DOMAIN CONFIGURATION — Single Source of Truth
 *
 * This module is the ONLY place where domain → product mapping lives.
 * Used by:
 *   - Middleware (proxy.ts) for routing/rewrites/headers
 *   - Server Components for reading x-product-domain header
 *   - Dashboard sidebar for feature visibility
 *
 * Rules:
 *   - No `window`, no `document`, no `localStorage` — this is server-safe
 *   - No React, no hooks, no state — this is pure data + pure functions
 *   - < 5ms execution — no async, no fetch, no DB
 */

// =============================================================================
// UNIFIED PRODUCT DOMAIN TYPE
// =============================================================================

/**
 * All product domains in the system.
 * This replaces the fragmented types from domain-navigation.ts (5 types)
 * and domain-policy.ts (2 types "api" | "dashboard").
 */
export type ProductDomain =
  | "shop"
  | "showcase"
  | "marketing"
  | "api"
  | "dashboard"
  | "booking";

// =============================================================================
// HOSTNAME → PRODUCT MAPPING
// =============================================================================

/** Production subdomain → product */
const PRODUCTION_HOSTNAME_MAP: Record<string, ProductDomain> = {
  "shop.flowauxi.com": "shop",
  "pages.flowauxi.com": "showcase",
  "marketing.flowauxi.com": "marketing",
  "api.flowauxi.com": "api",
  "booking.flowauxi.com": "booking",
  "flowauxi.com": "dashboard",
  "www.flowauxi.com": "dashboard",
};

/** Development port → product */
const DEV_PORT_MAP: Record<string, ProductDomain> = {
  "3000": "dashboard",
  "3001": "shop",
  "3002": "showcase", // FIXED: was "marketing"
  "3003": "marketing", // FIXED: was "showcase"
  "3004": "api",
  "3005": "booking",
};

/** Landing page routes per product (middleware rewrites "/" to these) */
const LANDING_PAGE_MAP: Record<ProductDomain, string> = {
  shop: "/shop",
  showcase: "/showcase",
  marketing: "/marketing",
  api: "/apis",
  booking: "/booking",
  dashboard: "/", // default, no rewrite needed
};

// =============================================================================
// DOMAIN RESOLUTION (used by middleware only)
// =============================================================================

/**
 * Resolve hostname + port to a ProductDomain.
 * Ultra-fast, pure function, no side effects.
 *
 * @param hostname - e.g. "shop.flowauxi.com" or "localhost"
 * @param port - e.g. "3001" (only relevant in dev)
 */
export function resolveDomain(hostname: string, port?: string): ProductDomain {
  // Production: exact hostname match
  if (PRODUCTION_HOSTNAME_MAP[hostname]) {
    return PRODUCTION_HOSTNAME_MAP[hostname];
  }

  // Production: subdomain prefix match (handles edge cases)
  if (hostname.startsWith("shop.")) return "shop";
  if (hostname.startsWith("pages.")) return "showcase";
  if (hostname.startsWith("marketing.")) return "marketing";
  if (hostname.startsWith("api.")) return "api";
  if (hostname.startsWith("booking.")) return "booking";

  // Development: port-based mapping
  if (
    port &&
    (hostname.includes("localhost") || hostname.includes("127.0.0.1"))
  ) {
    return DEV_PORT_MAP[port] || "dashboard";
  }

  // Default
  return "dashboard";
}

/**
 * Get the landing page route for a product domain.
 * Used by middleware to rewrite "/" to the correct landing page.
 */
export function getLandingRoute(domain: ProductDomain): string {
  return LANDING_PAGE_MAP[domain];
}

// =============================================================================
// FEATURE VISIBILITY MATRIX
// =============================================================================

export interface DomainVisibilityRules {
  // Core navigation
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
  forms: boolean;
  contacts: boolean;

  // Onboarding requirements
  // Only domains that are WhatsApp-centric (the core chatbot product)
  // require WhatsApp connection as a prerequisite to access the dashboard.
  // E-commerce (shop), appointments (booking), portfolio (showcase), and
  // campaigns (marketing) are independent products.
  requiresWhatsApp: boolean;
}

const DOMAIN_VISIBILITY: Record<ProductDomain, DomainVisibilityRules> = {
  shop: {
    analytics: true,
    messages: true,
    aiSettings: true,
    previewBot: true,
    orders: true,
    products: true,
    appointments: false,
    services: false,
    showcase: false,
    campaigns: false,
    bulkMessages: false,
    templates: false,
    forms: false,
    contacts: false,
    requiresWhatsApp: false,
  },

  showcase: {
    analytics: true,
    messages: true,
    aiSettings: true,
    previewBot: true,
    orders: false,
    products: false,
    appointments: false,
    services: false,
    showcase: true,
    campaigns: false,
    bulkMessages: false,
    templates: false,
    forms: false,
    contacts: false,
    requiresWhatsApp: false,
  },

  marketing: {
    analytics: true,
    messages: true,
    aiSettings: true,
    previewBot: true,
    orders: false,
    products: false,
    appointments: false,
    services: false,
    showcase: false,
    campaigns: true,
    bulkMessages: true,
    templates: true,
    forms: true,
    contacts: true,
    requiresWhatsApp: false,
  },

  api: {
    analytics: false,
    messages: false,
    aiSettings: false,
    previewBot: false,
    orders: false,
    products: false,
    appointments: false,
    services: false,
    showcase: false,
    campaigns: false,
    bulkMessages: false,
    templates: false,
    forms: false,
    contacts: false,
    requiresWhatsApp: false,
  },

  booking: {
    analytics: true,
    messages: true,
    aiSettings: true,
    previewBot: true,
    orders: false,
    products: false,
    appointments: true,
    services: true,
    showcase: false,
    campaigns: false,
    bulkMessages: false,
    templates: false,
    forms: false,
    contacts: false,
    requiresWhatsApp: false,
  },

  dashboard: {
    analytics: true,
    messages: true,
    aiSettings: true,
    previewBot: true,
    orders: true,
    products: true,
    appointments: true,
    services: true,
    showcase: true,
    campaigns: false,
    bulkMessages: false,
    templates: false,
    forms: false,
    contacts: false,
    requiresWhatsApp: true,
  },
};

/**
 * Get visibility rules for a product domain.
 * Used by dashboard sidebar and layout for feature gating.
 */
export function getDomainVisibility(
  domain: ProductDomain,
): DomainVisibilityRules {
  return DOMAIN_VISIBILITY[domain] || DOMAIN_VISIBILITY.dashboard;
}

/**
 * Check if a specific feature is visible on a product domain.
 */
export function isFeatureVisible(
  feature: keyof DomainVisibilityRules,
  domain: ProductDomain,
): boolean {
  return getDomainVisibility(domain)[feature];
}

// =============================================================================
// ROUTE ACCESS POLICY (used by domain-policy.ts / proxy.ts)
// =============================================================================

export interface DomainRouteConfig {
  product: ProductDomain;
  allowedRoutes: string[];
  blockedRoutes: string[];
  defaultHome: string;
  loginPath: string;
  seoBase: string;
}

const ROUTE_CONFIG: Record<string, DomainRouteConfig> = {
  api: {
    product: "api",
    allowedRoutes: ["/apis", "/console", "/docs", "/pricing"],
    blockedRoutes: [
      "/dashboard",
      "/onboarding",
      "/settings",
      "/whatsapp-admin",
    ],
    defaultHome: "/apis",
    loginPath: "/console/login",
    seoBase: "https://api.flowauxi.com",
  },
  dashboard: {
    product: "dashboard",
    allowedRoutes: [
      "/",
      "/dashboard",
      "/login",
      "/signup",
      "/onboarding",
      "/settings",
      "/store",
      "/payment",
      "/privacy",
      "/terms",
    ],
    blockedRoutes: ["/console", "/docs"],
    defaultHome: "/",
    loginPath: "/login",
    seoBase: "https://flowauxi.com",
  },
};

/**
 * Get route configuration for a product domain.
 * For products without explicit route config (shop, showcase, marketing),
 * falls back to dashboard config.
 */
export function getRouteConfig(domain: ProductDomain): DomainRouteConfig {
  return ROUTE_CONFIG[domain] || ROUTE_CONFIG.dashboard;
}

// =============================================================================
// VALIDATION
// =============================================================================

const VALID_DOMAINS: ProductDomain[] = [
  "shop",
  "showcase",
  "marketing",
  "api",
  "dashboard",
  "booking",
];

export function isValidProductDomain(value: string): value is ProductDomain {
  return VALID_DOMAINS.includes(value as ProductDomain);
}
