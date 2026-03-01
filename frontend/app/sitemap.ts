import { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getAllActiveStoreSlugs } from "@/lib/store";
import { resolveProductDomain } from "@/lib/seo/domain-seo";

/**
 * ENTERPRISE DYNAMIC SITEMAP — Per-Domain Aware
 * ==============================================
 *
 * Generates domain-specific sitemaps:
 *   shop.flowauxi.com/sitemap.xml  → shop pages only
 *   marketing.flowauxi.com/sitemap.xml → marketing pages only
 *   api.flowauxi.com/sitemap.xml   → API docs/console pages only
 *   pages.flowauxi.com/sitemap.xml → showcase pages only
 *   www.flowauxi.com/sitemap.xml   → main domain + cross-references to all subdomains
 *
 * This ensures each subdomain's sitemap only contains its own URLs,
 * which is critical for Google to treat them as separate properties.
 *
 * @see https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 */

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers();
  const host = headersList.get("host") || "www.flowauxi.com";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocalhost ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;
  const domain = resolveProductDomain(host);

  const staticLastModified = new Date("2026-03-01T00:00:00Z");

  // =====================================================
  // SHOP SUBDOMAIN SITEMAP
  // =====================================================
  if (domain === "shop") {
    const entries: MetadataRoute.Sitemap = [
      {
        url: baseUrl,
        lastModified: staticLastModified,
        changeFrequency: "weekly",
        priority: 1.0,
      },
      {
        url: `${baseUrl}/pricing`,
        lastModified: staticLastModified,
        changeFrequency: "monthly",
        priority: 0.8,
      },
    ];

    // Dynamic store pages
    try {
      const stores = await getAllActiveStoreSlugs();
      stores.forEach((store) => {
        entries.push({
          url: `${baseUrl}/store/${store.slug}`,
          lastModified: new Date(store.updatedAt),
          changeFrequency: "daily",
          priority: 0.8,
        });
      });
      console.log(
        `[sitemap:shop] ✅ Generated ${entries.length} entries (incl. ${stores.length} stores)`,
      );
    } catch (err) {
      console.error("[sitemap:shop] ⚠️ Failed to fetch stores:", err);
    }

    return entries;
  }

  // =====================================================
  // MARKETING SUBDOMAIN SITEMAP
  // =====================================================
  if (domain === "marketing") {
    return [
      {
        url: baseUrl,
        lastModified: staticLastModified,
        changeFrequency: "weekly",
        priority: 1.0,
      },
    ];
  }

  // =====================================================
  // API SUBDOMAIN SITEMAP
  // =====================================================
  if (domain === "api") {
    return [
      {
        url: baseUrl,
        lastModified: staticLastModified,
        changeFrequency: "weekly",
        priority: 1.0,
      },
      {
        url: `${baseUrl}/docs`,
        lastModified: staticLastModified,
        changeFrequency: "weekly",
        priority: 0.9,
      },
      {
        url: `${baseUrl}/console`,
        lastModified: staticLastModified,
        changeFrequency: "monthly",
        priority: 0.7,
      },
    ];
  }

  // =====================================================
  // SHOWCASE/PAGES SUBDOMAIN SITEMAP
  // =====================================================
  if (domain === "showcase") {
    return [
      {
        url: baseUrl,
        lastModified: staticLastModified,
        changeFrequency: "weekly",
        priority: 1.0,
      },
    ];
  }

  // =====================================================
  // MAIN DOMAIN SITEMAP (www.flowauxi.com)
  // Includes own pages + cross-references to all subdomains
  // =====================================================

  const staticPages: MetadataRoute.Sitemap = [
    // Homepage — Maximum Priority
    {
      url: baseUrl,
      lastModified: staticLastModified,
      changeFrequency: "daily",
      priority: 1.0,
    },
    // Cross-domain references to subdomain landing pages
    // This helps Google discover subdomains from the main domain
    {
      url: "https://shop.flowauxi.com",
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://marketing.flowauxi.com",
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://pages.flowauxi.com",
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://api.flowauxi.com",
      lastModified: staticLastModified,
      changeFrequency: "weekly",
      priority: 0.9,
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
  ];

  // Dynamic store pages (on main domain path /store/...)
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
      `[sitemap:main] ✅ Generated ${storePages.length} dynamic store entries`,
    );
  } catch (err) {
    console.error("[sitemap:main] ⚠️ Failed to fetch stores for sitemap:", err);
  }

  return [...staticPages, ...storePages];
}
