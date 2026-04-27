import { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveProductDomain } from "@/lib/seo/domain-seo";

/**
 * ENTERPRISE ROBOTS.TXT — Multi-Domain Aware
 * ============================================
 *
 * Generates per-domain robots.txt with:
 *   ✅ Domain-specific disallow rules
 *   ✅ Per-domain sitemap references
 *   ✅ Main domain lists ALL subdomain sitemaps (sitemap index pattern)
 *   ✅ Proper crawl budget protection per subdomain
 *
 * Multi-domain strategy:
 *   - Each subdomain has its own sitemap reference
 *   - Main domain additionally lists all subdomain sitemaps for cross-discovery
 *   - Private routes are disallowed consistently across all domains
 *
 * @see https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
 */

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers();
  const host = headersList.get("host") || "www.flowauxi.com";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocalhost ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;
  const domain = resolveProductDomain(host);

  // ── Comprehensive disallow list — shared across all domains ──────────
  // FAANG-Level Crawl Budget Optimization
  const sharedDisallowPaths = [
    // Admin & Dashboard (private, not indexable)
    "/admin/",
    "/dashboard/",
    "/settings/",
    "/onboarding/",
    "/onboarding-embedded/",
    "/whatsapp-admin/",

    // API Endpoints (data endpoints, not pages)
    "/api/",

    // Authentication flows (contain tokens, one-time use)
    "/reset-password/",
    "/activate/",
    "/login/",
    "/signup/",
    "/forgot-password/",
    "/verify-email/",

    // E-commerce private flows
    "/store/*/checkout/",
    "/store/*/track-order/",
    "/payment/",
    "/payment-success/",

    // Utility / internal
    "/offline/",
    "/error/",
    "/test-google-auth/",

    // PWA assets (not meaningful pages)
    "/sw.js",
    "/manifest.webmanifest",

    // ════════════════════════════════════════════════════════════════════════
    // FAANG-LEVEL CRAWL BUDGET OPTIMIZATION
    // ════════════════════════════════════════════════════════════════════════
    // Block low-value crawl paths to preserve crawl budget
    
    // Parameter URLs (duplicate content)
    "/*?sort=",
    "/*?filter=",
    "/*?page=",
    "/*?limit=",
    "/*?offset=",
    
    // UTM and tracking parameters (duplicate content)
    "/*?utm_",
    "/*?ref=",
    "/*?fbclid=",
    "/*?gclid=",
    "/*?msclkid=",
    "/*?source=",
    
    // Search and query URLs (low value)
    "/search",
    "/search?",
    
    // Session and state URLs
    "/*?session=",
    "/*?state=",
    "/*?token=",
    "/*?code=",
    
    // Cart and checkout URLs (private)
    "/cart/",
    "/checkout/",
    
    // Debug and development paths
    "/_next/",
    "/__next/",
    
    // Static assets (already indexed separately)
    "/*.json$",
    "/*.xml$",

    // Content restrictions
    "/blog/page/",
    "/blog/tag/",
    "/blog/author/",
    "/preview/",
    "/draft/",
    "/api/health",
    "/api/metrics",
    "/_debug/",
    "/sw.js.map",
  ];

  // ── Per-domain additional disallows ──────────────────────────────────
  const domainDisallows: Record<string, string[]> = {
    api: ["/console/"], // Private developer console
    shop: [], // Store pages are public
    marketing: [],
    showcase: [],
    dashboard: [],
  };

  const disallowPaths = [
    ...sharedDisallowPaths,
    ...(domainDisallows[domain] || []),
  ];

  // ── Sitemap references ──────────────────────────────────────────────
  // Main domain lists ALL sitemaps (acts as sitemap index pattern)
  // Subdomains list only their own sitemap
  const sitemaps: string[] = [];

  if (domain === "dashboard") {
    // Main domain: list all sitemaps for cross-domain discovery
    sitemaps.push(
      `${baseUrl}/sitemap.xml`,
      "https://shop.flowauxi.com/sitemap.xml",
      "https://marketing.flowauxi.com/sitemap.xml",
      "https://pages.flowauxi.com/sitemap.xml",
      "https://api.flowauxi.com/sitemap.xml",
    );
  } else {
    // Subdomain: only own sitemap
    sitemaps.push(`${baseUrl}/sitemap.xml`);
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/flowauxi2024seo.txt"],
        disallow: disallowPaths,
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: disallowPaths,
        crawlDelay: 0,
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: disallowPaths,
        crawlDelay: 1,
      },
    ],
    sitemap: sitemaps,
  };
}
