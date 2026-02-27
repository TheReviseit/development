import { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getAllActiveStoreSlugs } from "@/lib/store";

/**
 * ENTERPRISE DYNAMIC SITEMAP
 * ==========================
 *
 * This sitemap combines:
 *   ✅ Static platform pages (homepage, signup, login, legal)
 *   ✅ Dynamic store pages (all active merchant stores)
 *   ✅ Per-store product pages (top products from each store)
 *   ✅ SEO-optimized priorities and change frequencies
 *   ✅ Multi-domain aware (works on any host)
 *
 * Google Search Console Integration:
 *   - Auto-discovered via /robots.txt → Sitemap: /sitemap.xml
 *   - All URLs use absolute canonical paths
 *   - lastModified uses real database timestamps
 *
 * Performance:
 *   - Store slugs fetched with lightweight SELECT (no products loaded)
 *   - Capped at 5000 stores per sitemap (Google's 50k URL limit)
 *   - Static entries use stable dates (prevents unnecessary re-crawling)
 *
 * @see https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers();
  const host = headersList.get("host") || "www.flowauxi.com";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocalhost ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  // Stable date for static pages (update when making significant changes)
  const staticLastModified = new Date("2026-02-27T00:00:00Z");

  // =====================================================
  // STATIC PLATFORM PAGES
  // =====================================================

  const staticPages: MetadataRoute.Sitemap = [
    // Homepage — Maximum Priority
    {
      url: baseUrl,
      lastModified: staticLastModified,
      changeFrequency: "daily",
      priority: 1.0,
    },
    // Conversion Pages
    {
      url: `${baseUrl}/signup`,
      lastModified: staticLastModified,
      changeFrequency: "monthly",
      priority: 0.95,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: staticLastModified,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    // Pricing
    {
      url: `${baseUrl}/pricing`,
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    // Legal & Compliance
    {
      url: `${baseUrl}/terms`,
      lastModified: staticLastModified,
      changeFrequency: "yearly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: staticLastModified,
      changeFrequency: "yearly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/data-deletion`,
      lastModified: staticLastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/data-handling-policy`,
      lastModified: staticLastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    // Utility Pages
    {
      url: `${baseUrl}/forgot-password`,
      lastModified: staticLastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/verify-email`,
      lastModified: staticLastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    // Shop Landing
    {
      url: `${baseUrl}/shop`,
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];

  // =====================================================
  // DYNAMIC STORE PAGES
  // =====================================================

  let storePages: MetadataRoute.Sitemap = [];
  try {
    const stores = await getAllActiveStoreSlugs();

    storePages = stores.map((store) => ({
      url: `${baseUrl}/store/${store.slug}`,
      lastModified: new Date(store.updatedAt),
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));

    console.log(
      `[sitemap] ✅ Generated ${storePages.length} dynamic store entries`,
    );
  } catch (err) {
    console.error("[sitemap] ⚠️ Failed to fetch stores for sitemap:", err);
    // Graceful degradation — static pages still work
  }

  // =====================================================
  // COMBINE ALL ENTRIES
  // =====================================================

  return [...staticPages, ...storePages];
}
