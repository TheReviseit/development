import { MetadataRoute } from "next";

/**
 * WORLD-CLASS SEO SITEMAP CONFIGURATION
 * =====================================
 *
 * This sitemap follows Google's best practices and includes:
 * ✅ Proper priority hierarchy (1.0 for homepage, decreasing for other pages)
 * ✅ Realistic change frequencies based on actual content update patterns
 * ✅ ISO 8601 date formatting for lastModified timestamps
 * ✅ All publicly accessible pages with proper indexing metadata
 * ✅ Strategic inclusion of conversion-focused pages
 * ✅ Exclusion of private/auth-gated pages (onboarding, dashboard)
 *
 * IMPORTANT: Login/Signup pages ARE included because they have valuable
 * content and CTAs, but marked with noindex in their page metadata.
 * This tells search engines about their existence without indexing content.
 */

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://www.flowauxi.com";

  // Update this date when making significant site-wide changes
  // Using a stable date prevents unnecessary re-crawling
  const lastModified = new Date("2026-01-21T00:00:00Z");
  const recentUpdate = new Date("2026-01-21T00:00:00Z");

  return [
    // ==========================================
    // HOMEPAGE - Maximum Priority
    // ==========================================
    {
      url: baseUrl,
      lastModified: recentUpdate,
      changeFrequency: "daily",
      priority: 1.0,
    },

    // ==========================================
    // PRIMARY CONVERSION PAGES - Highest Priority
    // These drive user acquisition and revenue
    // ==========================================
    {
      url: `${baseUrl}/signup`,
      lastModified: lastModified,
      changeFrequency: "monthly",
      priority: 0.95, // Critical for conversions - sign up flow
    },
    {
      url: `${baseUrl}/login`,
      lastModified: lastModified,
      changeFrequency: "monthly",
      priority: 0.9, // Important for returning users
    },

    // ==========================================
    // LEGAL & COMPLIANCE PAGES - Medium Priority
    // Essential for trust, compliance, and user transparency
    // ==========================================
    {
      url: `${baseUrl}/terms`,
      lastModified: lastModified,
      changeFrequency: "yearly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: lastModified,
      changeFrequency: "yearly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/data-deletion`,
      lastModified: lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/data-handling-policy`,
      lastModified: lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },

    // ==========================================
    // AUTHENTICATION SUPPORT PAGES - Lower Priority
    // Utility pages for user account management
    // ==========================================
    {
      url: `${baseUrl}/forgot-password`,
      lastModified: lastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/verify-email`,
      lastModified: lastModified,
      changeFrequency: "yearly",
      priority: 0.4,
    },

    // ==========================================
    // NOTE: Excluded Pages (Not in Sitemap)
    // ==========================================
    // - /dashboard/* - Requires authentication, dynamic content
    // - /onboarding* - User-specific onboarding flows
    // - /reset-password - One-time use with tokens, should not be indexed
    // - /api/* - API endpoints, not web pages
    // - /offline - PWA offline fallback page

    // ==========================================
    // FUTURE PAGES - Ready to Activate
    // Uncomment when these pages are live
    // ==========================================

    // Pricing Page (High Priority - Direct Revenue Impact)
    // {
    //   url: `${baseUrl}/pricing`,
    //   lastModified: lastModified,
    //   changeFrequency: "weekly",
    //   priority: 0.95,
    // },

    // Features/Product Page (High Priority - Product Discovery)
    // {
    //   url: `${baseUrl}/features`,
    //   lastModified: lastModified,
    //   changeFrequency: "weekly",
    //   priority: 0.90,
    // },

    // About Us Page (Medium-High Priority - Brand Trust)
    // {
    //   url: `${baseUrl}/about`,
    //   lastModified: lastModified,
    //   changeFrequency: "monthly",
    //   priority: 0.75,
    // },

    // Contact Page (Medium-High Priority - Lead Generation)
    // {
    //   url: `${baseUrl}/contact`,
    //   lastModified: lastModified,
    //   changeFrequency: "monthly",
    //   priority: 0.80,
    // },

    // Blog/Resources (High Priority - SEO Content Hub)
    // {
    //   url: `${baseUrl}/blog`,
    //   lastModified: lastModified,
    //   changeFrequency: "daily",
    //   priority: 0.85,
    // },

    // Documentation (Medium Priority - User Support)
    // {
    //   url: `${baseUrl}/docs`,
    //   lastModified: lastModified,
    //   changeFrequency: "weekly",
    //   priority: 0.70,
    // },

    // Help/Support Center (Medium Priority - Customer Success)
    // {
    //   url: `${baseUrl}/help`,
    //   lastModified: lastModified,
    //   changeFrequency: "weekly",
    //   priority: 0.65,
    // },

    // Use Cases Page (Medium-High Priority - Product Marketing)
    // {
    //   url: `${baseUrl}/use-cases`,
    //   lastModified: lastModified,
    //   changeFrequency: "monthly",
    //   priority: 0.75,
    // },

    // Integration Marketplace (Medium Priority - Feature Discovery)
    // {
    //   url: `${baseUrl}/integrations`,
    //   lastModified: lastModified,
    //   changeFrequency: "weekly",
    //   priority: 0.70,
    // },

    // Customer Success Stories / Case Studies
    // {
    //   url: `${baseUrl}/customers`,
    //   lastModified: lastModified,
    //   changeFrequency: "monthly",
    //   priority: 0.75,
    // },

    // Security & Compliance Page
    // {
    //   url: `${baseUrl}/security`,
    //   lastModified: lastModified,
    //   changeFrequency: "quarterly",
    //   priority: 0.65,
    // },
  ];
}

/**
 * SITEMAP PRIORITY GUIDELINES (Google's Recommendations):
 * ========================================================
 *
 * 1.0  = Homepage only (your most important page)
 * 0.9-0.95 = Primary conversion pages (Signup, Pricing, Features, Login)
 * 0.8-0.85 = Important content / revenue pages (Blog, Contact, Product Pages)
 * 0.7-0.75 = Secondary content pages (About, Docs, Use Cases, Customers)
 * 0.6-0.65 = Supporting pages (Help, Security, Integrations)
 * 0.5  = Legal/Compliance pages (Privacy, Terms, Data Deletion)
 * 0.3-0.4 = Utility pages (Forgot Password, Verify Email)
 *
 * CHANGE FREQUENCY GUIDELINES:
 * ============================
 *
 * always  = Never use (reserved for real-time/constantly changing data)
 * hourly  = News sites, live feeds, stock tickers
 * daily   = Blogs, news content, homepage with frequent updates
 * weekly  = Product pages, pricing, documentation, features
 * monthly = Company info, about pages, auth pages, use cases
 * yearly  = Legal documents, terms, privacy policies
 * never   = Archived content, historical pages
 *
 * PRO TIP: Be honest with change frequencies. Over-promising
 * "daily" when content changes "monthly" can hurt your SEO.
 *
 * PRIORITY VS CRAWL FREQUENCY:
 * ============================
 * Priority does NOT determine crawl frequency - it's relative
 * importance WITHIN YOUR SITE. All pages are valuable, priority
 * just helps search engines understand your site structure.
 */
