/**
 * Domain Context Utilities for Client-Side
 *
 * Provides React hooks and utilities for domain-aware UI rendering.
 *
 * Usage:
 *   const domain = useDomainContext();
 *   const shopUrl = getDomainUrl('shop', '/dashboard');
 */

"use client";

import { useState, useEffect } from "react";

export type ProductDomain =
  | "shop"
  | "showcase"
  | "marketing"
  | "dashboard"
  | "api";

/**
 * React hook to get current product domain from hostname.
 *
 * @returns ProductDomain - Current domain context
 */
export function useDomainContext(): ProductDomain {
  const [domain, setDomain] = useState<ProductDomain>("dashboard");

  useEffect(() => {
    const hostname = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname;

    // Production subdomain detection
    if (hostname === "shop.flowauxi.com" || hostname.includes("shop.")) {
      setDomain("shop");
    } else if (
      hostname === "showcase.flowauxi.com" ||
      hostname.includes("showcase.")
    ) {
      setDomain("showcase");
    } else if (
      hostname === "marketing.flowauxi.com" ||
      hostname.includes("marketing.")
    ) {
      setDomain("marketing");
    } else if (hostname === "api.flowauxi.com") {
      setDomain("api");
    } else if (
      hostname.includes("localhost") ||
      hostname.includes("vercel.app")
    ) {
      // Development: infer from path
      if (
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/products") ||
        pathname.startsWith("/orders")
      ) {
        setDomain("shop");
      } else if (pathname.startsWith("/showcase")) {
        setDomain("showcase");
      } else if (
        pathname.startsWith("/campaigns") ||
        pathname.startsWith("/bulk-messages")
      ) {
        setDomain("marketing");
      } else if (
        pathname.startsWith("/apis") ||
        pathname.startsWith("/console")
      ) {
        setDomain("api");
      } else {
        setDomain("dashboard");
      }
    } else {
      setDomain("dashboard");
    }
  }, []);

  return domain;
}

/**
 * Get full URL for a target domain and path.
 *
 * @param targetDomain - Target product domain
 * @param path - Path within domain (default: '/')
 * @returns Full URL string
 */
export function getDomainUrl(
  targetDomain: ProductDomain,
  path: string = "/",
): string {
  // Production domain mapping
  const baseDomains: Record<ProductDomain, string> = {
    shop: "https://shop.flowauxi.com",
    showcase: "https://showcase.flowauxi.com",
    marketing: "https://marketing.flowauxi.com",
    api: "https://api.flowauxi.com",
    dashboard: "https://flowauxi.com",
  };

  // Development override
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname.includes("localhost")) {
      return `http://localhost:${window.location.port}${path}`;
    }
    if (hostname.includes("vercel.app")) {
      // Vercel preview URLs
      return `${window.location.protocol}//${hostname}${path}`;
    }
  }

  return `${baseDomains[targetDomain]}${path}`;
}

/**
 * Check if user is on the correct domain for a feature.
 *
 * @param expectedDomain - Expected domain for this feature
 * @returns boolean - True if on correct domain
 */
export function isOnDomain(expectedDomain: ProductDomain): boolean {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname.toLowerCase();

  if (expectedDomain === "shop") {
    return hostname === "shop.flowauxi.com" || hostname.includes("shop.");
  } else if (expectedDomain === "showcase") {
    return (
      hostname === "showcase.flowauxi.com" || hostname.includes("showcase.")
    );
  } else if (expectedDomain === "marketing") {
    return (
      hostname === "marketing.flowauxi.com" || hostname.includes("marketing.")
    );
  } else if (expectedDomain === "api") {
    return hostname === "api.flowauxi.com";
  } else {
    return hostname === "flowauxi.com" || hostname === "www.flowauxi.com";
  }
}

/**
 * Get domain metadata for display.
 *
 * @param domain - Product domain
 * @returns Object with name, description, icon
 */
export function getDomainMetadata(domain: ProductDomain) {
  const metadata = {
    shop: {
      name: "Shop",
      description: "Manage products, orders, and inventory",
      icon: "🛍️",
      color: "#4F46E5", // Indigo
    },
    showcase: {
      name: "Showcase",
      description: "Display your portfolio and catalog",
      icon: "🎨",
      color: "#7C3AED", // Purple
    },
    marketing: {
      name: "Marketing",
      description: "Run campaigns and bulk messaging",
      icon: "📢",
      color: "#EC4899", // Pink
    },
    api: {
      name: "API Platform",
      description: "OTP and messaging APIs",
      icon: "⚡",
      color: "#10B981", // Green
    },
    dashboard: {
      name: "Dashboard",
      description: "Unified control panel",
      icon: "📊",
      color: "#3B82F6", // Blue
    },
  };

  return metadata[domain] || metadata.dashboard;
}
