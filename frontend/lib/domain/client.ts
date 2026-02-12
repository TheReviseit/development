/**
 * Client-Side Product Domain Resolution
 *
 * Uses the SAME `resolveDomain()` function as the middleware (proxy.ts),
 * called once at mount with `window.location` values.
 *
 * This is NOT a "client-side detection hack" — it's the same pure function
 * the middleware uses, just called from the client for the dashboard layout.
 */

import { resolveDomain, type ProductDomain } from "@/lib/domain/config";

/**
 * Resolve the product domain from the current browser location.
 * Uses the same logic as middleware — pure function, no side effects.
 *
 * @returns The product domain (shop, booking, showcase, marketing, api, dashboard)
 */
export function getProductDomainFromBrowser(): ProductDomain {
  if (typeof window === "undefined") return "dashboard";

  return resolveDomain(
    window.location.hostname,
    window.location.port || undefined,
  );
}
