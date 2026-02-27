import { MetadataRoute } from "next";
import { headers } from "next/headers";

/**
 * ENTERPRISE ROBOTS.TXT — Multi-Domain Aware
 * ============================================
 *
 * Generates per-host robots.txt with proper rules for:
 *   ✅ All major crawlers (Googlebot, Bingbot, *)
 *   ✅ Private routes (dashboard, admin, settings)
 *   ✅ Checkout/payment flows (should never be indexed)
 *   ✅ API endpoints (not web pages)
 *   ✅ Internal utility routes
 *   ✅ Dynamic sitemap reference
 *
 * Multi-domain safety:
 *   - Sitemap URL uses the current host (works on subdomains)
 *   - Rules are consistent across all domains
 *
 * @see https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
 */

export default async function robots(): Promise<MetadataRoute.Robots> {
  const headersList = await headers();
  const host = headersList.get("host") || "www.flowauxi.com";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocalhost ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  // Comprehensive disallow list — all private / non-indexable paths
  const disallowPaths = [
    // Admin & Dashboard
    "/admin/",
    "/dashboard/",
    "/settings/",
    "/onboarding/",
    "/onboarding-embedded/",
    "/whatsapp-admin/",

    // API Endpoints (not web pages)
    "/api/",

    // Authentication flows (contain tokens, one-time use)
    "/reset-password/",
    "/activate/",

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
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: disallowPaths,
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: disallowPaths,
        // Googlebot: no crawl delay (Google ignores it, but shows good intent)
        crawlDelay: 0,
      },
      {
        userAgent: "Bingbot",
        allow: "/",
        disallow: disallowPaths,
        // Bing respects crawl delay — 1s is polite without being slow
        crawlDelay: 1,
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
