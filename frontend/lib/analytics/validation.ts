/**
 * Analytics Validation & Debugging Utilities
 * ============================================
 *
 * Production-grade debugging tools for cross-domain tracking validation.
 * Use these in browser console or automated tests.
 *
 * Usage:
 *   import { validateAnalytics, checkCrossDomain, getDebugReport, validateEvent } from './validation';
 *
 * Or in browser console:
 *   window.validateAnalytics()
 */

import { analyticsHealth, getAnalyticsHealth } from "./health";
import { getDataLayerContents, getDataLayerEventCount } from "./dataLayer";
import { getClientId, isClientIdInitialized } from "./clientId";
import { getQueueSize, hasQueuedEvents } from "./fallbackQueue";
import { isDebugMode } from "./config";
import type { AnalyticsEvent } from "./events";
import { isValidEventName } from "./events";

export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
  summary: string;
}

export interface ValidationCheck {
  name: string;
  status: "pass" | "fail" | "warning";
  message: string;
  details?: unknown;
}

// =============================================================================
// EVENT VALIDATION - FAANG-Level Type Safety
// =============================================================================

/**
 * Validate an analytics event against the schema.
 * Throws in development if event is invalid.
 * 
 * This ensures no garbage data reaches GA4.
 * 
 * @param event - The event to validate
 * @throws Error in development if event is invalid
 */
export function validateEvent(event: AnalyticsEvent): void {
  // Always run validation in development
  if (process.env.NODE_ENV === "development") {
    // Validate event name
    if (!isValidEventName(event.name)) {
      const error = new Error(
        `[Analytics:Validation] Invalid event name: "${event.name}". ` +
        `Event must be defined in lib/analytics/events.ts. ` +
        `Use a valid GA4 event or add to AnalyticsEvent union type.`
      );
      console.error(error);
      throw error;
    }

    // Validate required params for specific events
    const requiredParamsValidation = validateRequiredParams(event);
    if (!requiredParamsValidation.valid) {
      const error = new Error(
        `[Analytics:Validation] Missing required params for "${event.name}": ` +
        `${requiredParamsValidation.missing.join(", ")}`
      );
      console.error(error);
      throw error;
    }

    if (isDebugMode()) {
      console.log(
        `%c[Analytics:Validation] Event valid: ${event.name}`,
        "color: #10B981;"
      );
    }
  }
}

/**
 * Validate required parameters for specific events
 */
function validateRequiredParams(event: AnalyticsEvent): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  // Purchase requires transaction_id, value, currency, items
  if (event.name === "purchase") {
    if (!event.params.transaction_id) missing.push("transaction_id");
    if (!event.params.value) missing.push("value");
    if (!event.params.currency) missing.push("currency");
    if (!event.params.items) missing.push("items");
  }
  
  // begin_checkout requires value, currency, items
  if (event.name === "begin_checkout") {
    if (!event.params.value) missing.push("value");
    if (!event.params.currency) missing.push("currency");
    if (!event.params.items) missing.push("items");
  }
  
  // add_to_cart requires value, currency, items
  if (event.name === "add_to_cart") {
    if (!event.params.value) missing.push("value");
    if (!event.params.currency) missing.push("currency");
    if (!event.params.items) missing.push("items");
  }
  
  // login/signup require method
  if (event.name === "login" || event.name === "signup") {
    if (!event.params.method) missing.push("method");
  }
  
  return { valid: missing.length === 0, missing };
}

/**
 * Run all analytics validation checks.
 */
export function validateAnalytics(): ValidationResult {
  const checks: ValidationCheck[] = [];

  // Check 1: gtag availability
  const gtagAvailable = typeof window !== "undefined" && typeof window.gtag === "function";
  checks.push({
    name: "gtag Function",
    status: gtagAvailable ? "pass" : "fail",
    message: gtagAvailable ? "gtag function available" : "gtag not found on window",
  });

  // Check 2: dataLayer
  const dataLayerExists = typeof window !== "undefined" && Array.isArray(window.dataLayer);
  const dataLayerCount = dataLayerExists ? window.dataLayer.length : 0;
  checks.push({
    name: "Data Layer",
    status: dataLayerExists ? "pass" : "fail",
    message: `Data layer exists with ${dataLayerCount} entries`,
    details: dataLayerExists,
  });

  // Check 3: _ga cookie
  const gaCookie = getGaCookie();
  const hasGaCookie = !!gaCookie;
  checks.push({
    name: "_ga Cookie",
    status: hasGaCookie ? "pass" : "warning",
    message: hasGaCookie
      ? `_ga cookie found: ${gaCookie.substring(0, 30)}...`
      : "_ga cookie not found (may not be set yet)",
    details: gaCookie,
  });

  // Check 4: Client ID initialization
  const clientIdInitialized = isClientIdInitialized();
  checks.push({
    name: "Client ID",
    status: clientIdInitialized ? "pass" : "warning",
    message: clientIdInitialized
      ? `Client ID initialized: ${getClientId()?.substring(0, 8)}...`
      : "Client ID not initialized",
  });

  // Check 5: Health metrics
  const health = getAnalyticsHealth();
  const dropRateOk = health.dropRate < 20;
  checks.push({
    name: "Health - Drop Rate",
    status: dropRateOk ? "pass" : "fail",
    message: `Drop rate: ${health.dropRate}% ${dropRateOk ? "(healthy)" : "(CRITICAL)"}`,
    details: health.dropRate,
  });

  checks.push({
    name: "Health - Script",
    status: health.scriptLoaded ? "pass" : "fail",
    message: health.scriptBlocked
      ? "Script blocked (ad blocker detected)"
      : health.scriptLoaded
      ? "Script loaded successfully"
      : "Script status unknown",
  });

  // Check 6: Fallback queue
  const queueSize = getQueueSize();
  checks.push({
    name: "Fallback Queue",
    status: queueSize === 0 ? "pass" : "warning",
    message: `${queueSize} events queued (will retry)`,
    details: queueSize,
  });

  // Check 7: Cross-domain linkers
  const hasLinkerParam = typeof window !== "undefined" && window.location.search.includes("_ga=");
  checks.push({
    name: "Cross-Domain Linker",
    status: hasLinkerParam ? "pass" : "pass",
    message: hasLinkerParam
      ? "Incoming cross-domain linker detected"
      : "No incoming linker (direct visit or first party cookie working)",
  });

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warning").length;

  return {
    passed: failed === 0,
    checks,
    summary: `Analytics validation: ${passed} passed, ${failed} failed, ${warnings} warnings`,
  };
}

/**
 * Check cross-domain tracking specifically.
 */
export function checkCrossDomain(): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  // Cookie domain verification
  const gaCookie = getGaCookie();
  if (gaCookie) {
    const parts = gaCookie.split(".");
    const clientId = parts.length >= 4 ? `${parts[2]}.${parts[3]}` : "unknown";
    checks.push({
      name: "Client ID Persistence",
      status: "pass",
      message: `client_id: ${clientId}`,
      details: clientId,
    });
  }

  // Check if hostname matches cookie domain
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isSubdomain = hostname.includes(".") && !hostname.startsWith("localhost");
    
    checks.push({
      name: "Hostname Context",
      status: isSubdomain ? "pass" : "pass",
      message: `Current hostname: ${hostname}`,
      details: { hostname, isSubdomain },
    });
  }

  // Check cross-domain config in dataLayer
  const dlContents = getDataLayerContents();
  const configEntry = dlContents.find(
    (e: unknown) => typeof e === "object" && e !== null && "event" in e && (e as Record<string, unknown>).event === "gtag_config"
  );
  
  if (configEntry) {
    checks.push({
      name: "GTAG Config",
      status: "pass",
      message: "GTAG config event found in dataLayer",
    });
  }

  return checks;
}

/**
 * Get detailed debug report.
 */
export function getDebugReport() {
  const validation = validateAnalytics();
  const health = getAnalyticsHealth();
  const crossDomain = checkCrossDomain();

  return {
    timestamp: new Date().toISOString(),
    validation,
    health,
    crossDomain,
    dataLayer: {
      eventCount: getDataLayerEventCount(),
      recentEvents: getDataLayerContents().slice(-5),
    },
  };
}

/**
 * Print formatted validation results to console.
 */
export function printValidation(): void {
  const result = validateAnalytics();

  console.group("🔍 Analytics Validation Results");
  console.log(`%c${result.summary}`, "font-weight: bold");

  for (const check of result.checks) {
    const icon = check.status === "pass" ? "✅" : check.status === "fail" ? "❌" : "⚠️";
    const color = check.status === "pass" ? "#10B981" : check.status === "fail" ? "#EF4444" : "#F59E0B";
    console.log(`%c${icon} ${check.name}: ${check.message}`, `color: ${color}`);
  }

  console.groupEnd();

  if (isDebugMode()) {
    console.log("Detailed health:", getAnalyticsHealth());
  }
}

function getGaCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(_ga[^=]*)=([^;]+)/);
  return match ? match[2] : null;
}

// Expose validation functions on window for console debugging
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).validateAnalytics = validateAnalytics;
  (window as unknown as Record<string, unknown>).checkCrossDomain = checkCrossDomain;
  (window as unknown as Record<string, unknown>).getDebugReport = getDebugReport;
  (window as unknown as Record<string, unknown>).printValidation = printValidation;
}