/**
 * Domain Detection Utilities
 * ===========================
 * Helpers to detect the current product domain from various contexts
 */

import type { ProductDomain } from "../domain/config";
import { resolveDomain } from "../domain/config";

/**
 * Detect domain from window location (client-side)
 */
export function detectDomainFromWindow(): ProductDomain {
  if (typeof window === "undefined") {
    return "dashboard";
  }

  const { hostname, port } = window.location;
  return resolveDomain(hostname, port);
}

/**
 * Detect domain from headers (server-side)
 * Use in Server Components and API routes
 */
export function detectDomainFromHeaders(headers: Headers): ProductDomain {
  const host = headers.get("host") || "";
  const [hostname, port] = host.split(":");
  return resolveDomain(hostname, port);
}

/**
 * Universal domain detection
 * Works in both client and server contexts
 */
export function detectCurrentDomain(): ProductDomain {
  if (typeof window !== "undefined") {
    return detectDomainFromWindow();
  }
  return "dashboard"; // Fallback for server-side
}
