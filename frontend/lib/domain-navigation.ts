/**
 * ENTERPRISE DOMAIN-BASED NAVIGATION CONFIGURATION
 *
 * This module provides bulletproof domain detection and feature visibility rules
 * for multi-product architecture (Shop, Showcase, Marketing, API Console, Dashboard)
 */

export type ProductDomain =
  | "shop"
  | "showcase"
  | "marketing"
  | "api"
  | "dashboard";

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

  // Marketing features (future)
  campaigns: boolean;
  bulkMessages: boolean;
  templates: boolean;
}

/**
 * DOMAIN VISIBILITY MATRIX
 *
 * Defines which features are visible on each product domain
 * - TRUE = Feature is visible
 * - FALSE = Feature is hidden
 */
export const DOMAIN_VISIBILITY: Record<ProductDomain, DomainVisibilityRules> = {
  // SHOP DOMAIN - E-commerce focused
  shop: {
    analytics: true,
    messages: true,
    aiSettings: true,
    previewBot: true,
    orders: true, // ✅ Shop-specific
    products: true, // ✅ Shop-specific
    appointments: false, // ❌ Not relevant for shop
    services: false, // ❌ Not relevant for shop
    showcase: false, // ❌ Different product
    campaigns: false,
    bulkMessages: false,
    templates: false,
  },

  // SHOWCASE DOMAIN - Portfolio/Gallery focused
  showcase: {
    analytics: true,
    messages: true,
    aiSettings: true,
    previewBot: true,
    orders: false, //
    products: false, //
    appointments: false, //
    services: false, //
    showcase: true, //
    campaigns: false,
    bulkMessages: false,
    templates: false,
  },

  // MARKETING DOMAIN - Campaign management focused (future)
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
    campaigns: true, // ✅ Marketing-specific
    bulkMessages: true, // ✅ Marketing-specific
    templates: true, // ✅ Marketing-specific
  },

  // API CONSOLE - Developer tools
  api: {
    analytics: false, // ❌ Different context
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
  },

  // DASHBOARD (DEFAULT) - Unified view showing ALL features
  dashboard: {
    analytics: true,
    messages: true,
    aiSettings: true,
    previewBot: true,
    orders: true, // ✅ Show all
    products: true, // ✅ Show all
    appointments: true, // ✅ Show all
    services: true, // ✅ Show all
    showcase: true, // ✅ Show all
    campaigns: false, // Not yet implemented
    bulkMessages: false,
    templates: false,
  },
};

/**
 * Detect product domain from current environment
 *
 * Priority order:
 * 1. localStorage DEV_DOMAIN override (development only)
 * 2. Query param ?product=shop (development only)
 * 3. Subdomain detection (shop.flowauxi.com → shop)
 * 4. Path-based detection (fallback for localhost)
 * 5. Default to dashboard
 */
export function detectProductDomain(): ProductDomain {
  // SERVER-SIDE: Default to dashboard
  if (typeof window === "undefined") {
    return "dashboard";
  }

  const hostname = window.location.hostname;
  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);

  // ==========================================================================
  // DEVELOPMENT MODE (localhost / 127.0.0.1)
  // ==========================================================================
  if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
    const port = window.location.port;

    // Priority 1: Port-based detection (from npm scripts)
    if (port === "3001") return "shop";
    if (port === "3002") return "showcase";
    if (port === "3003") return "marketing";
    if (port === "3004") return "api";

    // Priority 2: Check query param (?product=shop)
    const productParam = searchParams.get("product") as ProductDomain | null;
    if (productParam && isValidProductDomain(productParam)) {
      localStorage.setItem("DEV_DOMAIN", productParam);
      return productParam;
    }

    // Priority 3: Check localStorage override
    const devDomain = localStorage.getItem(
      "DEV_DOMAIN",
    ) as ProductDomain | null;
    if (devDomain && isValidProductDomain(devDomain)) {
      return devDomain;
    }

    // Priority 4: Path-based detection (localhost fallback)
    const pathDomain = detectFromPath(pathname);
    if (pathDomain) {
      return pathDomain;
    }

    // Default localhost to dashboard (port 3000)
    return "dashboard";
  }

  // ==========================================================================
  // PRODUCTION MODE (subdomain detection)
  // ==========================================================================

  // shop.flowauxi.com
  if (hostname.startsWith("shop.")) {
    console.log(`🌐 [Domain Detection] Production subdomain: shop`);
    return "shop";
  }

  // pages.flowauxi.com
  if (hostname.startsWith("pages.")) {
    console.log(`🌐 [Domain Detection] Production subdomain: showcase`);
    return "showcase";
  }

  // marketing.flowauxi.com
  if (hostname.startsWith("marketing.")) {
    console.log(`🌐 [Domain Detection] Production subdomain: marketing`);
    return "marketing";
  }

  // api.flowauxi.com
  if (hostname.startsWith("api.")) {
    console.log(`🌐 [Domain Detection] Production subdomain: api`);
    return "api";
  }

  // Default: dashboard (flowauxi.com)
  console.log(`🌐 [Domain Detection] Production default: dashboard`);
  return "dashboard";
}

/**
 * Detect domain from URL pathname (development fallback)
 */
function detectFromPath(pathname: string): ProductDomain | null {
  // Shop routes
  if (
    pathname.startsWith("/dashboard/products") ||
    pathname.startsWith("/dashboard/orders") ||
    pathname === "/products" ||
    pathname === "/orders"
  ) {
    return "shop";
  }

  // Showcase routes
  if (pathname.startsWith("/dashboard/showcase") || pathname === "/showcase") {
    return "showcase";
  }

  // Marketing routes
  if (
    pathname.startsWith("/dashboard/campaigns") ||
    pathname.startsWith("/dashboard/bulk-messages") ||
    pathname.startsWith("/dashboard/templates")
  ) {
    return "marketing";
  }

  // API console routes
  if (pathname.startsWith("/console") || pathname.startsWith("/apis")) {
    return "api";
  }

  return null;
}

/**
 * Validate product domain
 */
function isValidProductDomain(domain: string): domain is ProductDomain {
  return ["shop", "showcase", "marketing", "api", "dashboard"].includes(domain);
}

/**
 * Get visibility rules for current domain
 */
export function getDomainVisibility(
  domain: ProductDomain,
): DomainVisibilityRules {
  return DOMAIN_VISIBILITY[domain];
}

/**
 * Check if feature should be visible on current domain
 */
export function isFeatureVisible(
  feature: keyof DomainVisibilityRules,
  domain: ProductDomain,
): boolean {
  return DOMAIN_VISIBILITY[domain][feature];
}
