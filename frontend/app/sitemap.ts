import { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getAllActiveStoreSlugs } from "@/lib/store";
import { resolveProductDomain } from "@/lib/seo/domain-seo";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║           ENTERPRISE DYNAMIC SITEMAP GENERATOR          ║
 * ║           Per-Domain Aware • Multi-Tenant                ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║                                                          ║
 * ║  shop.flowauxi.com/sitemap.xml                           ║
 * ║  ├── Homepage, Pricing, Signup, Login, Terms, Privacy    ║
 * ║  ├── Dynamic /store/{username} pages (from DB)           ║
 * ║  └── Data handling + deletion policies                   ║
 * ║                                                          ║
 * ║  marketing.flowauxi.com/sitemap.xml                      ║
 * ║  ├── Homepage, Signup, Login, Terms, Privacy             ║
 * ║  └── Pricing                                             ║
 * ║                                                          ║
 * ║  api.flowauxi.com/sitemap.xml                            ║
 * ║  ├── Homepage (/apis), Docs, Pricing                     ║
 * ║  ├── Console (developer portal)                          ║
 * ║  └── Signup, Login, Terms, Privacy                       ║
 * ║                                                          ║
 * ║  pages.flowauxi.com/sitemap.xml                          ║
 * ║  ├── Homepage, Signup, Login, Terms, Privacy             ║
 * ║  └── Dynamic /showcase/{username} pages (from DB)        ║
 * ║                                                          ║
 * ║  www.flowauxi.com/sitemap.xml                            ║
 * ║  ├── Homepage, Pricing, Signup, Login                    ║
 * ║  ├── Legal pages, Data policies                          ║
 * ║  └── X-refs to all subdomain landing pages               ║
 * ║                                                          ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * @see https://developers.google.com/search/docs/crawling-indexing/sitemaps
 */

// ── Shared static pages available on every subdomain ──────────
function sharedPages(baseUrl: string, lastMod: Date): MetadataRoute.Sitemap {
  return [
    {
      url: `${baseUrl}/signup`,
      lastModified: lastMod,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: lastMod,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: lastMod,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: lastMod,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/data-deletion`,
      lastModified: lastMod,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/data-handling-policy`,
      lastModified: lastMod,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}

/**
 * Fetch showcase users with public portfolios for sitemap.
 * Uses direct supabase query for username + updated_at fields.
 */
async function getShowcaseUsernames(): Promise<
  Array<{ username: string; updated_at: string | null }>
> {
  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("username, updated_at")
      .not("username", "is", null)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("[sitemap] ⚠️ Failed to fetch showcase users:", error);
      return [];
    }
    return (data || []).filter(
      (u): u is { username: string; updated_at: string | null } => !!u.username,
    );
  } catch (err) {
    console.error("[sitemap] ⚠️ Showcase users query failed:", err);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const headersList = await headers();
  const host = headersList.get("host") || "www.flowauxi.com";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocalhost ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;
  const domain = resolveProductDomain(host);
  const now = new Date();

  // =====================================================
  // 🛍️ SHOP SUBDOMAIN SITEMAP
  // =====================================================
  if (domain === "shop") {
    const entries: MetadataRoute.Sitemap = [
      {
        url: baseUrl,
        lastModified: now,
        changeFrequency: "daily",
        priority: 1.0,
      },
      {
        url: `${baseUrl}/pricing`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.9,
      },
      ...sharedPages(baseUrl, now),
    ];

    // Dynamic store pages
    try {
      const stores = await getAllActiveStoreSlugs();
      for (const store of stores) {
        entries.push({
          url: `${baseUrl}/store/${store.slug}`,
          lastModified: new Date(store.updatedAt),
          changeFrequency: "daily",
          priority: 0.8,
        });
      }
      console.log(
        `[sitemap:shop] ✅ ${entries.length} entries (${stores.length} stores)`,
      );
    } catch (err) {
      console.error("[sitemap:shop] ⚠️ Failed to fetch stores:", err);
    }

    return entries;
  }

  // =====================================================
  // 📢 MARKETING SUBDOMAIN SITEMAP
  // =====================================================
  if (domain === "marketing") {
    return [
      {
        url: baseUrl,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 1.0,
      },
      {
        url: `${baseUrl}/pricing`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.9,
      },
      ...sharedPages(baseUrl, now),
    ];
  }

  // =====================================================
  // 🔐 API SUBDOMAIN SITEMAP
  // =====================================================
  if (domain === "api") {
    return [
      {
        url: baseUrl,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 1.0,
      },
      {
        url: `${baseUrl}/apis`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.95,
      },
      {
        url: `${baseUrl}/docs`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.95,
      },
      {
        url: `${baseUrl}/apis/pricing`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.9,
      },
      {
        url: `${baseUrl}/console`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.8,
      },
      {
        url: `${baseUrl}/console/keys`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.7,
      },
      {
        url: `${baseUrl}/console/logs`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.7,
      },
      {
        url: `${baseUrl}/console/projects`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.7,
      },
      {
        url: `${baseUrl}/console/otp`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.7,
      },
      ...sharedPages(baseUrl, now),
    ];
  }

  // =====================================================
  // 🎨 SHOWCASE / PAGES SUBDOMAIN SITEMAP
  // =====================================================
  if (domain === "showcase") {
    const entries: MetadataRoute.Sitemap = [
      {
        url: baseUrl,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 1.0,
      },
      {
        url: `${baseUrl}/pricing`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.9,
      },
      ...sharedPages(baseUrl, now),
    ];

    // Dynamic showcase portfolio pages
    const users = await getShowcaseUsernames();
    for (const user of users) {
      entries.push({
        url: `${baseUrl}/showcase/${user.username}`,
        lastModified: user.updated_at ? new Date(user.updated_at) : now,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
    if (users.length > 0) {
      console.log(
        `[sitemap:showcase] ✅ ${entries.length} entries (${users.length} portfolios)`,
      );
    }

    return entries;
  }

  // =====================================================
  // 🏠 MAIN DOMAIN SITEMAP (www.flowauxi.com)
  // =====================================================
  const mainEntries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    // Cross-domain references
    {
      url: "https://shop.flowauxi.com",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://marketing.flowauxi.com",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://pages.flowauxi.com",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://api.flowauxi.com",
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    // Conversion pages
    {
      url: `${baseUrl}/pricing`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.95,
    },
    {
      url: `${baseUrl}/signup`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    // Legal
    {
      url: `${baseUrl}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/data-deletion`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/data-handling-policy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];

  // Dynamic store pages on main domain
  try {
    const stores = await getAllActiveStoreSlugs();
    for (const store of stores) {
      mainEntries.push({
        url: `${baseUrl}/store/${store.slug}`,
        lastModified: new Date(store.updatedAt),
        changeFrequency: "daily",
        priority: 0.7,
      });
    }
    console.log(
      `[sitemap:main] ✅ ${mainEntries.length} entries (${stores.length} stores)`,
    );
  } catch (err) {
    console.error("[sitemap:main] ⚠️ Failed to fetch stores:", err);
  }

  return mainEntries;
}
