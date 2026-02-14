/**
 * SERVER-SIDE PRODUCT UTILITIES
 * ===============================
 * Server-only functions for product context resolution.
 * Used in Server Components, API Routes, and middleware.
 *
 * NEVER import this in Client Components!
 */

import { headers } from "next/headers";
import { PRODUCT_REGISTRY, getProductByDomain } from "./registry";
import type { ProductConfig, ProductDomain } from "./types";

/**
 * Get current product from request headers (set by middleware)
 *
 * Usage in Server Components:
 * ```tsx
 * import { getCurrentProduct } from '@/lib/product/server';
 *
 * export default async function Page() {
 *   const product = await getCurrentProduct();
 *   return <h1>{product.name}</h1>;
 * }
 * ```
 */
export async function getCurrentProduct(): Promise<ProductConfig> {
  const headersList = await headers();
  const productId = headersList.get("x-product-id") as ProductDomain | null;

  if (!productId || !PRODUCT_REGISTRY[productId]) {
    // Fallback to domain detection if header missing (shouldn't happen with middleware)
    const host = headersList.get("host") || "";
    const [hostname, port] = host.split(":");
    return getProductByDomain(hostname, port);
  }

  return PRODUCT_REGISTRY[productId];
}

/**
 * Get product ID from headers (lighter than getting full config)
 */
export async function getCurrentProductId(): Promise<ProductDomain> {
  const product = await getCurrentProduct();
  return product.id;
}

/**
 * Check if a specific feature is enabled for current product
 *
 * Usage:
 * ```tsx
 * const hasOrders = await isFeatureEnabled('orders');
 * if (hasOrders) {
 *   return <OrdersSection />;
 * }
 * ```
 */
export async function isFeatureEnabled(feature: string): Promise<boolean> {
  const product = await getCurrentProduct();
  return product.enabledFeatures.includes(feature as any);
}

/**
 * Get pricing for current product
 */
export async function getCurrentPricing() {
  const product = await getCurrentProduct();
  return product.pricing;
}

/**
 * Get product context from Request object (for API routes)
 *
 * Usage in API Route:
 * ```ts
 * import { getProductFromRequest } from '@/lib/product/server';
 *
 * export async function POST(request: Request) {
 *   const product = getProductFromRequest(request);
 *   // ...
 * }
 * ```
 */
export function getProductFromRequest(request: Request): ProductConfig {
  const productId = request.headers.get("x-product-id") as ProductDomain | null;

  if (!productId || !PRODUCT_REGISTRY[productId]) {
    // Fallback to host-based detection
    const host = request.headers.get("host") || "";
    const [hostname, port] = host.split(":");
    return getProductByDomain(hostname, port);
  }

  return PRODUCT_REGISTRY[productId];
}
