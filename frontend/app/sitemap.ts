import { MetadataRoute } from "next";

/**
 * Professional SEO Sitemap Configuration
 * Automatically generates XML sitemap for search engine optimization
 *
 * Best Practices Implemented:
 * - Proper priority hierarchy (1.0 for homepage, decreasing for other pages)
 * - Realistic change frequencies based on content type
 * - ISO 8601 date formatting for lastModified
 * - All publicly accessible pages included
 * - Private/auth-required pages excluded
 */

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://www.flowauxi.com";

  // Use a stable date for lastModified to avoid constant changes
  // Update this date when you make significant changes to the site
  const lastModified = new Date("2025-12-15T00:00:00Z");

  return [
    // ==========================================
    // HOMEPAGE - Highest Priority
    // ==========================================
    {
      url: baseUrl,
      lastModified: lastModified,
      changeFrequency: "daily",
      priority: 1.0,
    },

    // ==========================================
    // CONVERSION PAGES - High Priority
    // ==========================================
    {
      url: `${baseUrl}/signup`,
      lastModified: lastModified,
      changeFrequency: "monthly",
      priority: 0.9, // Very important for conversions
    },

    // ==========================================
    // NOTE: Login, forgot-password, reset-password, verify-email
    // are excluded from sitemap because they have noindex meta tags.
    // Sitemap should only contain indexable pages.
    // ==========================================

    // ==========================================
    // LEGAL & POLICY PAGES - Lower Priority
    // These change infrequently but are important for compliance
    // ==========================================
    {
      url: `${baseUrl}/terms`,
      lastModified: lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/data-deletion`,
      lastModified: lastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/data-handling-policy`,
      lastModified: lastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },

    // ==========================================
    // FUTURE PAGES - Uncomment when ready
    // ==========================================
    // Features page (when created)
    // {
    //   url: `${baseUrl}/features`,
    //   lastModified: lastModified,
    //   changeFrequency: "weekly",
    //   priority: 0.9,
    // },

    // Pricing page (when created)
    // {
    //   url: `${baseUrl}/pricing`,
    //   lastModified: lastModified,
    //   changeFrequency: "weekly",
    //   priority: 0.9,
    // },

    // Blog (when created)
    // {
    //   url: `${baseUrl}/blog`,
    //   lastModified: lastModified,
    //   changeFrequency: "daily",
    //   priority: 0.8,
    // },

    // About page (when created)
    // {
    //   url: `${baseUrl}/about`,
    //   lastModified: lastModified,
    //   changeFrequency: "monthly",
    //   priority: 0.7,
    // },

    // Contact page (when created)
    // {
    //   url: `${baseUrl}/contact`,
    //   lastModified: lastModified,
    //   changeFrequency: "monthly",
    //   priority: 0.8,
    // },

    // Documentation (when created)
    // {
    //   url: `${baseUrl}/docs`,
    //   lastModified: lastModified,
    //   changeFrequency: "weekly",
    //   priority: 0.7,
    // },

    // Help/Support (when created)
    // {
    //   url: `${baseUrl}/help`,
    //   lastModified: lastModified,
    //   changeFrequency: "weekly",
    //   priority: 0.6,
    // },
  ];
}

/**
 * SITEMAP PRIORITY GUIDELINES:
 *
 * 1.0  = Homepage only
 * 0.9  = Main conversion pages (Signup, Pricing, Features)
 * 0.8  = Important content pages (Blog, Contact, Docs)
 * 0.7  = Secondary content pages (About, Help)
 * 0.5  = Legal pages (Terms, Privacy)
 * 0.3  = Utility pages (Login, Password Reset)
 *
 * CHANGE FREQUENCY GUIDELINES:
 *
 * always  = Never use (reserved for real-time data)
 * hourly  = News sites, real-time dashboards
 * daily   = Blogs, frequently updated content, homepage
 * weekly  = Product pages, documentation, pricing
 * monthly = About pages, company info, signup/login
 * yearly  = Legal documents, utility pages
 * never   = Archived content only
 */
