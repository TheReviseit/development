/**
 * Analytics Configuration — Single Source of Truth
 * =================================================
 *
 * FAANG-Level Multi-Domain Analytics Configuration.
 *
 * This module is the ONLY place where:
 *   - Domain → GA4 Measurement ID mapping lives
 *   - Cross-domain linker configuration lives
 *   - Environment detection logic lives
 *   - Analytics versioning lives
 *
 * Rules:
 *   - Server-safe (no window, no document)
 *   - Pure data + pure functions
 *   - < 1ms execution
 *
 * @see https://developers.google.com/analytics/devguides/collection/ga4
 */

// =============================================================================
// VERSIONING
// =============================================================================

/**
 * Analytics configuration version.
 * Increment when:
 *   - Measurement IDs change
 *   - Cross-domain config changes
 *   - Event schema version changes
 *
 * Used by health monitoring to track config drift.
 */
export const ANALYTICS_CONFIG_VERSION = "1.0.0";

// =============================================================================
// TYPES
// =============================================================================

export type AnalyticsEnvironment = "development" | "staging" | "production";

export interface DomainAnalyticsConfig {
  /** GA4 Measurement ID (e.g., G-E06R01F4TF) */
  measurementId: string;
  /** Product domain identifier */
  domain: string;
  /** Production hostname */
  hostname: string;
  /** Human-readable stream name for debugging */
  streamName: string;
}

export interface CrossDomainConfig {
  /** Domains to link for cross-domain tracking */
  domains: string[];
  /** Accept incoming linker parameters */
  acceptIncoming: boolean;
  /** Decorate forms for cross-domain */
  decorateForms: boolean;
  /** URL passthrough for first-party cookies */
  urlPassthrough: boolean;
}

export interface AnalyticsResolvedConfig {
  /** The resolved domain config */
  domainConfig: DomainAnalyticsConfig;
  /** Cross-domain linker settings */
  crossDomain: CrossDomainConfig;
  /** Current environment */
  environment: AnalyticsEnvironment;
  /** Whether analytics is enabled */
  enabled: boolean;
  /** Whether debug mode is active */
  debug: boolean;
  /** Config version */
  version: string;
}

// =============================================================================
// DOMAIN → MEASUREMENT ID MAPPING
// =============================================================================

/**
 * Unified Domain → GA4 Measurement ID Mapping
 * 
 * STRATEGY: Single GA4 Property (G-F02P5002S8) for ALL domains
 * 
 * Why single ID:
 *   1. Unified user journey across subdomains
 *   2. Automatic cross-domain session stitching
 *   3. Single source of truth for attribution
 *   4. Simplified debugging and maintenance
 * 
 * Hostname dimension used for segmentation in GA4:
 *   - Hostname = "shop.flowauxi.com" → Shop funnel
 *   - Hostname = "marketing.flowauxi.com" → Marketing funnel
 *   - Hostname = "flowauxi.com" → Main platform
 */
const DOMAIN_MEASUREMENT_MAP: Record<string, DomainAnalyticsConfig> = {
  // ── Main Platform ──────────────────────────────────────────────────
  "flowauxi.com": {
    measurementId: "G-F02P5002S8",
    domain: "main",
    hostname: "flowauxi.com",
    streamName: "Flowauxi Main",
  },
  "www.flowauxi.com": {
    measurementId: "G-F02P5002S8",
    domain: "main",
    hostname: "www.flowauxi.com",
    streamName: "Flowauxi Main (www)",
  },

  // ── Shop (uses SAME ID for unified tracking) ───────────────────────
  "shop.flowauxi.com": {
    measurementId: "G-F02P5002S8",
    domain: "shop",
    hostname: "shop.flowauxi.com",
    streamName: "Flowauxi Shop",
  },

  // ── Marketing (uses SAME ID for unified tracking) ───────────────────
  "marketing.flowauxi.com": {
    measurementId: "G-F02P5002S8",
    domain: "marketing",
    hostname: "marketing.flowauxi.com",
    streamName: "Flowauxi Marketing",
  },
  
  // ── Other Subdomains (unified) ───────────────────────────────────────
  "pages.flowauxi.com": {
    measurementId: "G-F02P5002S8",
    domain: "showcase",
    hostname: "pages.flowauxi.com",
    streamName: "Flowauxi Pages",
  },
  "api.flowauxi.com": {
    measurementId: "G-F02P5002S8",
    domain: "api",
    hostname: "api.flowauxi.com",
    streamName: "Flowauxi API",
  },
  "booking.flowauxi.com": {
    measurementId: "G-F02P5002S8",
    domain: "booking",
    hostname: "booking.flowauxi.com",
    streamName: "Flowauxi Booking",
  },
};

/**
 * Development port → domain mapping.
 * Mirrors lib/domain/config.ts DEV_PORT_MAP.
 */
const DEV_PORT_DOMAIN_MAP: Record<string, string> = {
  "3000": "flowauxi.com",
  "3001": "shop.flowauxi.com",
  "3002": "pages.flowauxi.com",
  "3003": "marketing.flowauxi.com",
  "3004": "api.flowauxi.com",
  "3005": "booking.flowauxi.com",
};

/** Default config when domain cannot be resolved */
const DEFAULT_CONFIG: DomainAnalyticsConfig = {
  measurementId: "G-F02P5002S8",
  domain: "main",
  hostname: "flowauxi.com",
  streamName: "Flowauxi Main (fallback)",
};

// =============================================================================
// CROSS-DOMAIN CONFIGURATION
// =============================================================================

/**
 * Cross-domain linker configuration.
 * All Flowauxi domains participate in cross-domain tracking
 * so user journeys across shop ↔ main ↔ marketing are unified.
 *
 * @see https://developers.google.com/analytics/devguides/collection/ga4/cross-domain
 */
export const CROSS_DOMAIN_CONFIG: CrossDomainConfig = {
  domains: [
    "flowauxi.com",
    "shop.flowauxi.com",
    "marketing.flowauxi.com",
    "pages.flowauxi.com",
    "api.flowauxi.com",
    "booking.flowauxi.com",
  ],
  acceptIncoming: true,
  decorateForms: true,
  urlPassthrough: true,
};

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

/**
 * Detect the current analytics environment.
 * Uses NODE_ENV + hostname heuristics.
 */
export function getAnalyticsEnvironment(): AnalyticsEnvironment {
  // Server-side: use NODE_ENV
  if (typeof window === "undefined") {
    if (process.env.NODE_ENV === "production") return "production";
    if (process.env.NODE_ENV === "test") return "staging";
    return "development";
  }

  // Client-side: hostname-based
  const hostname = window.location.hostname;
  if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
    return "development";
  }
  if (hostname.includes("staging") || hostname.includes("preview")) {
    return "staging";
  }
  return "production";
}

/**
 * Check if analytics debug mode is active.
 * Enabled by:
 *   1. NEXT_PUBLIC_ANALYTICS_DEBUG=true env var
 *   2. ?analytics_debug=true URL parameter
 *   3. localStorage flag: analytics_debug=true
 */
export function isDebugMode(): boolean {
  // Env var (works server + client at build time)
  if (process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "true") return true;

  // Client-side checks
  if (typeof window === "undefined") return false;

  // URL parameter
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("analytics_debug") === "true") return true;
  } catch {
    // Ignore URL parsing errors
  }

  // localStorage flag
  try {
    if (localStorage.getItem("analytics_debug") === "true") return true;
  } catch {
    // Ignore storage errors
  }

  return false;
}

/**
 * Check if analytics should be enabled for the current environment.
 *
 * Rules:
 *   - Production: ALWAYS enabled
 *   - Staging: enabled
 *   - Development: DISABLED unless debug mode is active
 */
export function isAnalyticsEnabled(): boolean {
  const env = getAnalyticsEnvironment();

  if (env === "production") return true;
  if (env === "staging") return true;
  if (env === "development") return isDebugMode();

  return false;
}

// =============================================================================
// DOMAIN RESOLUTION
// =============================================================================

/**
 * Resolve a hostname to its analytics configuration.
 *
 * Resolution order:
 *   1. Exact hostname match in DOMAIN_MEASUREMENT_MAP
 *   2. Subdomain prefix match (shop.* → shop.flowauxi.com)
 *   3. Dev port mapping (localhost:3001 → shop.flowauxi.com)
 *   4. Fallback to DEFAULT_CONFIG
 *
 * @param hostname - e.g. "shop.flowauxi.com" or "localhost:3001"
 */
export function resolveDomainConfig(hostname: string): DomainAnalyticsConfig {
  // 1. Exact match
  const normalizedHost = hostname.split(":")[0]; // strip port
  if (DOMAIN_MEASUREMENT_MAP[normalizedHost]) {
    return DOMAIN_MEASUREMENT_MAP[normalizedHost];
  }

  // 2. Subdomain prefix match
  if (normalizedHost.startsWith("shop.")) return DOMAIN_MEASUREMENT_MAP["shop.flowauxi.com"];
  if (normalizedHost.startsWith("marketing.")) return DOMAIN_MEASUREMENT_MAP["marketing.flowauxi.com"];
  if (normalizedHost.startsWith("pages.")) return DOMAIN_MEASUREMENT_MAP["pages.flowauxi.com"];
  if (normalizedHost.startsWith("api.")) return DOMAIN_MEASUREMENT_MAP["api.flowauxi.com"];
  if (normalizedHost.startsWith("booking.")) return DOMAIN_MEASUREMENT_MAP["booking.flowauxi.com"];

  // 3. Dev port mapping
  if (normalizedHost === "localhost" || normalizedHost === "127.0.0.1") {
    const port = hostname.includes(":") ? hostname.split(":")[1] : "3000";
    const mappedDomain = DEV_PORT_DOMAIN_MAP[port];
    if (mappedDomain && DOMAIN_MEASUREMENT_MAP[mappedDomain]) {
      return DOMAIN_MEASUREMENT_MAP[mappedDomain];
    }
  }

  // 4. Fallback
  return DEFAULT_CONFIG;
}

/**
 * Get the fully resolved analytics configuration for a hostname.
 * This is the primary config resolver used by the analytics system.
 */
export function getAnalyticsConfig(hostname: string): AnalyticsResolvedConfig {
  return {
    domainConfig: resolveDomainConfig(hostname),
    crossDomain: CROSS_DOMAIN_CONFIG,
    environment: getAnalyticsEnvironment(),
    enabled: isAnalyticsEnabled(),
    debug: isDebugMode(),
    version: ANALYTICS_CONFIG_VERSION,
  };
}

// =============================================================================
// GA4 MEASUREMENT PROTOCOL (Server-Side Config)
// =============================================================================

/**
 * Server-side GA4 Measurement Protocol configuration.
 * Used by lib/analytics/server.ts for server-side event tracking.
 *
 * @see https://developers.google.com/analytics/devguides/collection/protocol/ga4
 */
export const MEASUREMENT_PROTOCOL_CONFIG = {
  /** GA4 Measurement Protocol endpoint */
  endpoint: "https://www.google-analytics.com/mp/collect",
  /** Debug endpoint for validation */
  debugEndpoint: "https://www.google-analytics.com/debug/mp/collect",
  /** API secret — stored in env, NOT in code (secret, not config) */
  getApiSecret: (): string | undefined => process.env.ANALYTICS_API_SECRET,
} as const;

// =============================================================================
// EXPORTS — All config values for external usage
// =============================================================================

export { DOMAIN_MEASUREMENT_MAP, DEFAULT_CONFIG };
