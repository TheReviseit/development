"use client";

/**
 * Product Context Provider — STATIC (No client-side detection)
 *
 * Product is determined by middleware (x-product-domain header),
 * passed from server layout as a prop. Zero useEffect, zero useState,
 * zero window.location, zero re-renders.
 *
 * Usage:
 *   const { product } = useProduct() // 'api' | 'dashboard'
 */

import React, { createContext, useContext } from "react";

export type ProductContext = "api" | "dashboard";

interface ProductContextValue {
  product: ProductContext;
  isApiProduct: boolean;
  isDashboardProduct: boolean;
}

const ProductCtx = createContext<ProductContextValue>({
  product: "dashboard",
  isApiProduct: false,
  isDashboardProduct: true,
});

/**
 * Hook to access product context
 */
export function useProduct(): ProductContextValue {
  return useContext(ProductCtx);
}

/**
 * Hook for simple product check
 */
export function useIsApiProduct(): boolean {
  return useContext(ProductCtx).isApiProduct;
}

/**
 * Static Provider — product is passed from server, never re-detected.
 *
 * In layout.tsx (server component):
 *   const product = (await headers()).get("x-product-domain") || "dashboard";
 *   <ProductProvider product={product as ProductContext}>
 *     {children}
 *   </ProductProvider>
 */
export function ProductProvider({
  children,
  product = "dashboard",
}: {
  children: React.ReactNode;
  product?: ProductContext;
}) {
  // Static value — no useState, no useEffect, no re-renders
  const value: ProductContextValue = {
    product,
    isApiProduct: product === "api",
    isDashboardProduct: product === "dashboard",
  };

  return <ProductCtx.Provider value={value}>{children}</ProductCtx.Provider>;
}

/**
 * Product-aware link component
 * Handles cross-domain navigation automatically
 */
export function useCrossDomainUrl(
  targetProduct: ProductContext,
  path: string,
): string {
  const { product: currentProduct } = useProduct();

  // Same product: relative path
  if (currentProduct === targetProduct) {
    return path;
  }

  // Cross-domain
  const baseUrl =
    targetProduct === "api"
      ? "https://api.flowauxi.com"
      : "https://flowauxi.com";

  return `${baseUrl}${path}`;
}
