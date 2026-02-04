"use client";

/**
 * Product Context Provider
 * Single source of truth for product context across the app.
 *
 * Usage:
 *   const product = useProduct() // 'api' | 'dashboard'
 *   const navItems = product === 'api' ? apiNavItems : dashboardNavItems
 */

import React, { createContext, useContext, useEffect, useState } from "react";

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
 * Provider component for product context
 */
export function ProductProvider({
  children,
  initialProduct,
}: {
  children: React.ReactNode;
  initialProduct?: ProductContext;
}) {
  const [product, setProduct] = useState<ProductContext>(
    initialProduct || "dashboard",
  );

  useEffect(() => {
    // Get product from URL params or hostname
    const hostname = window.location.hostname;
    const searchParams = new URLSearchParams(window.location.search);

    // Check URL override for development
    if (searchParams.get("product") === "api") {
      setProduct("api");
      return;
    }

    // Check hostname
    if (hostname === "api.flowauxi.com") {
      setProduct("api");
    } else if (
      hostname.includes("localhost") ||
      hostname.includes("vercel.app")
    ) {
      // Dev/preview: check if on API routes
      const pathname = window.location.pathname;
      if (
        pathname.startsWith("/apis") ||
        pathname.startsWith("/console") ||
        pathname.startsWith("/docs")
      ) {
        setProduct("api");
      }
    }
  }, []);

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
