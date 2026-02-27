/**
 * Domain SEO Configuration — FAANG-Level Multi-Domain SEO
 * =========================================================
 *
 * This is the SINGLE SOURCE OF TRUTH for SEO across all product domains.
 * Each subdomain gets completely independent:
 *   - Title, description, keywords
 *   - Open Graph and Twitter Cards
 *   - Organization + WebSite JSON-LD structured data
 *   - Canonical URL
 *
 * When someone searches:
 *   "Flowauxi shop"       → shop.flowauxi.com ranks
 *   "marketing tools"     → marketing.flowauxi.com ranks
 *   "portfolio builder"   → pages.flowauxi.com ranks
 *   "WhatsApp automation" → www.flowauxi.com ranks
 *   "OTP API"             → api.flowauxi.com ranks
 *
 * Architecture:
 *   resolveDomain(host) → ProductDomain → getDomainSeoConfig(domain) → full SEO config
 *
 * @see https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites
 */

import type { Metadata } from "next";

// =============================================================================
// TYPES
// =============================================================================

export type ProductDomain =
  | "shop"
  | "showcase"
  | "marketing"
  | "api"
  | "dashboard";

interface DomainSeoConfig {
  /** Product domain identifier */
  domain: ProductDomain;

  /** Primary SEO title — what appears in Google search results */
  title: string;
  /** Title template for child pages — %s is replaced with page title */
  titleTemplate: string;

  /** Meta description — 155 chars max for Google snippet */
  description: string;

  /** Target keywords — what people search to find this domain */
  keywords: string[];

  /** Production canonical URL */
  canonicalBase: string;

  /** Open Graph */
  og: {
    siteName: string;
    type: "website";
    locale: string;
    image: string;
    imageAlt: string;
  };

  /** Twitter card */
  twitter: {
    handle: string;
    site: string;
  };

  /** JSON-LD Organization schema */
  organization: {
    name: string;
    description: string;
    url: string;
    logo: string;
    sameAs: string[];
  };

  /** JSON-LD WebSite schema */
  website: {
    name: string;
    description: string;
  };

  /** Theme color for PWA/browser */
  themeColor: string;
}

// =============================================================================
// DOMAIN SEO CONFIGURATIONS — THE CORE
// =============================================================================

const DOMAIN_SEO_CONFIGS: Record<ProductDomain, DomainSeoConfig> = {
  // ─────────────────────────────────────────────────────────────────────
  // SHOP — E-commerce Platform
  // Ranks for: "flowauxi shop", "online store builder", "ecommerce platform"
  // ─────────────────────────────────────────────────────────────────────
  shop: {
    domain: "shop",
    title:
      "Flowauxi Shop — Build Your Online Store in Minutes | E-commerce Platform",
    titleTemplate: "%s | Flowauxi Shop",
    description:
      "Create your professional online store with Flowauxi Shop. AI-powered e-commerce platform with built-in payments, WhatsApp integration, order tracking, and beautiful themes. Start selling today — no coding required.",
    keywords: [
      "flowauxi shop",
      "online store builder",
      "ecommerce platform",
      "create online store",
      "sell online India",
      "WhatsApp store",
      "free online store",
      "ecommerce website builder",
      "digital storefront",
      "shop builder",
      "start online business",
      "online selling platform",
    ],
    canonicalBase: "https://shop.flowauxi.com",
    og: {
      siteName: "Flowauxi Shop",
      type: "website",
      locale: "en_IN",
      image: "https://shop.flowauxi.com/og-image.png",
      imageAlt: "Flowauxi Shop — Build Your Online Store",
    },
    twitter: {
      handle: "@flowauxi",
      site: "@flowauxi",
    },
    organization: {
      name: "Flowauxi Shop",
      description:
        "AI-powered e-commerce platform enabling businesses to create professional online stores with built-in payments and WhatsApp integration.",
      url: "https://shop.flowauxi.com",
      logo: "https://shop.flowauxi.com/icon-512.png",
      sameAs: [
        "https://www.linkedin.com/company/flowauxi",
        "https://twitter.com/flowauxi",
        "https://www.facebook.com/flowauxi",
        "https://www.youtube.com/@flowauxi",
      ],
    },
    website: {
      name: "Flowauxi Shop",
      description: "Online Store Builder & E-commerce Platform",
    },
    themeColor: "#22C15A",
  },

  // ─────────────────────────────────────────────────────────────────────
  // MARKETING — Campaign & Automation Platform
  // Ranks for: "marketing tools", "campaign automation", "marketing platform"
  // ─────────────────────────────────────────────────────────────────────
  marketing: {
    domain: "marketing",
    title:
      "Flowauxi Marketing — AI-Powered Campaign Automation & Growth Platform",
    titleTemplate: "%s | Flowauxi Marketing",
    description:
      "Enterprise-grade marketing automation platform with AI-powered campaigns, multi-channel broadcasting, audience segmentation, and real-time analytics. Scale your marketing with WhatsApp, SMS, and email — all in one place.",
    keywords: [
      "flowauxi marketing",
      "marketing automation",
      "campaign management",
      "marketing tools",
      "WhatsApp marketing",
      "bulk messaging",
      "email marketing",
      "SMS marketing",
      "marketing platform India",
      "AI marketing",
      "growth platform",
      "multi-channel marketing",
      "audience segmentation",
      "marketing analytics",
    ],
    canonicalBase: "https://marketing.flowauxi.com",
    og: {
      siteName: "Flowauxi Marketing",
      type: "website",
      locale: "en_IN",
      image: "https://marketing.flowauxi.com/og-image.png",
      imageAlt: "Flowauxi Marketing — AI Campaign Automation",
    },
    twitter: {
      handle: "@flowauxi",
      site: "@flowauxi",
    },
    organization: {
      name: "Flowauxi Marketing",
      description:
        "AI-powered marketing automation platform for campaign management, audience segmentation, and multi-channel broadcasting across WhatsApp, SMS, and email.",
      url: "https://marketing.flowauxi.com",
      logo: "https://marketing.flowauxi.com/icon-512.png",
      sameAs: [
        "https://www.linkedin.com/company/flowauxi",
        "https://twitter.com/flowauxi",
        "https://www.facebook.com/flowauxi",
        "https://www.youtube.com/@flowauxi",
      ],
    },
    website: {
      name: "Flowauxi Marketing",
      description: "AI Marketing Automation & Campaign Management Platform",
    },
    themeColor: "#7C3AED",
  },

  // ─────────────────────────────────────────────────────────────────────
  // SHOWCASE / PAGES — Portfolio & Website Builder
  // Ranks for: "portfolio builder", "showcase website", "portfolio platform"
  // ─────────────────────────────────────────────────────────────────────
  showcase: {
    domain: "showcase",
    title: "Flowauxi Pages — Professional Portfolio & Showcase Website Builder",
    titleTemplate: "%s | Flowauxi Pages",
    description:
      "Build stunning portfolio and showcase websites with Flowauxi Pages. 50+ premium templates, visual drag-and-drop builder, custom domains, SEO optimization, and AI-powered content tools. Perfect for creators, freelancers, and agencies.",
    keywords: [
      "flowauxi pages",
      "portfolio builder",
      "showcase website",
      "portfolio platform",
      "website builder",
      "professional portfolio",
      "freelancer portfolio",
      "creative portfolio",
      "agency website",
      "online portfolio maker",
      "portfolio templates",
      "showcase builder",
    ],
    canonicalBase: "https://pages.flowauxi.com",
    og: {
      siteName: "Flowauxi Pages",
      type: "website",
      locale: "en_IN",
      image: "https://pages.flowauxi.com/og-image.png",
      imageAlt: "Flowauxi Pages — Portfolio & Showcase Builder",
    },
    twitter: {
      handle: "@flowauxi",
      site: "@flowauxi",
    },
    organization: {
      name: "Flowauxi Pages",
      description:
        "Professional portfolio and showcase website builder with premium templates, visual editor, and AI-powered content tools for creators and businesses.",
      url: "https://pages.flowauxi.com",
      logo: "https://pages.flowauxi.com/icon-512.png",
      sameAs: [
        "https://www.linkedin.com/company/flowauxi",
        "https://twitter.com/flowauxi",
        "https://www.facebook.com/flowauxi",
        "https://www.youtube.com/@flowauxi",
      ],
    },
    website: {
      name: "Flowauxi Pages",
      description: "Professional Portfolio & Showcase Website Builder",
    },
    themeColor: "#0F766E",
  },

  // ─────────────────────────────────────────────────────────────────────
  // API — OTP & Developer Platform
  // Ranks for: "OTP API", "WhatsApp verification API", "SMS API India"
  // ─────────────────────────────────────────────────────────────────────
  api: {
    domain: "api",
    title: "Flowauxi API — Enterprise OTP Verification for WhatsApp & SMS",
    titleTemplate: "%s | Flowauxi API",
    description:
      "Enterprise-grade OTP verification API for WhatsApp and SMS. 99.9% uptime, sub-second delivery, developer-friendly SDKs. Trusted by 500+ businesses. Start with free credits.",
    keywords: [
      "flowauxi api",
      "OTP API",
      "WhatsApp OTP",
      "SMS verification API",
      "OTP verification",
      "WhatsApp API India",
      "SMS API",
      "authentication API",
      "two factor authentication",
      "developer API",
      "verification service",
    ],
    canonicalBase: "https://api.flowauxi.com",
    og: {
      siteName: "Flowauxi API",
      type: "website",
      locale: "en_US",
      image: "https://api.flowauxi.com/og-api.png",
      imageAlt: "Flowauxi API — Enterprise OTP Verification",
    },
    twitter: {
      handle: "@flowauxi",
      site: "@flowauxi",
    },
    organization: {
      name: "Flowauxi API",
      description:
        "Enterprise OTP verification API for WhatsApp and SMS with 99.9% uptime and sub-second delivery.",
      url: "https://api.flowauxi.com",
      logo: "https://api.flowauxi.com/icon-512.png",
      sameAs: [
        "https://www.linkedin.com/company/flowauxi",
        "https://twitter.com/flowauxi",
        "https://github.com/flowauxi",
      ],
    },
    website: {
      name: "Flowauxi API",
      description: "Enterprise OTP Verification API Platform",
    },
    themeColor: "#2563EB",
  },

  // ─────────────────────────────────────────────────────────────────────
  // DASHBOARD — Main WhatsApp Automation Platform
  // Ranks for: "WhatsApp automation", "flowauxi", "WhatsApp business API"
  // ─────────────────────────────────────────────────────────────────────
  dashboard: {
    domain: "dashboard",
    title:
      "Flowauxi — AI-Powered WhatsApp Automation & Business Messaging Platform",
    titleTemplate: "%s | Flowauxi",
    description:
      "Transform your WhatsApp into a powerful business tool. AI-powered automation, smart broadcasting, CRM integration, and analytics dashboard. Trusted by 500+ businesses across India.",
    keywords: [
      "flowauxi",
      "WhatsApp automation",
      "WhatsApp business API",
      "WhatsApp chatbot",
      "business messaging",
      "AI WhatsApp",
      "WhatsApp CRM",
      "WhatsApp marketing",
      "business automation India",
      "customer engagement platform",
    ],
    canonicalBase: "https://www.flowauxi.com",
    og: {
      siteName: "Flowauxi",
      type: "website",
      locale: "en_IN",
      image: "https://www.flowauxi.com/og-image.png",
      imageAlt: "Flowauxi — AI WhatsApp Automation Platform",
    },
    twitter: {
      handle: "@flowauxi",
      site: "@flowauxi",
    },
    organization: {
      name: "Flowauxi",
      description:
        "AI-Powered WhatsApp Automation and Business Messaging Platform trusted by 500+ businesses across India.",
      url: "https://www.flowauxi.com",
      logo: "https://www.flowauxi.com/icon-512.png",
      sameAs: [
        "https://www.linkedin.com/company/flowauxi",
        "https://twitter.com/flowauxi",
        "https://www.facebook.com/flowauxi",
        "https://www.youtube.com/@flowauxi",
        "https://github.com/flowauxi",
        "https://www.crunchbase.com/organization/flowauxi",
        "https://www.producthunt.com/products/flowauxi",
      ],
    },
    website: {
      name: "Flowauxi",
      description:
        "AI-Powered WhatsApp Automation & Business Messaging Platform",
    },
    themeColor: "#22C15A",
  },
};

// =============================================================================
// DOMAIN RESOLUTION
// =============================================================================

/**
 * Resolve hostname to ProductDomain — matches domain/config.ts logic.
 */
export function resolveProductDomain(host: string): ProductDomain {
  // Production subdomains
  if (host === "shop.flowauxi.com" || host.startsWith("shop.")) return "shop";
  if (host === "marketing.flowauxi.com" || host.startsWith("marketing."))
    return "marketing";
  if (host === "pages.flowauxi.com" || host.startsWith("pages."))
    return "showcase";
  if (host === "api.flowauxi.com" || host.startsWith("api.")) return "api";
  if (host === "flowauxi.com" || host === "www.flowauxi.com")
    return "dashboard";

  // Development ports
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    if (host.includes(":3001")) return "shop";
    if (host.includes(":3002")) return "showcase";
    if (host.includes(":3003")) return "marketing";
    if (host.includes(":3004")) return "api";
    return "dashboard";
  }

  return "dashboard";
}

// =============================================================================
// METADATA GENERATOR
// =============================================================================

/**
 * Get the full SEO configuration for a product domain.
 */
export function getDomainSeoConfig(domain: ProductDomain): DomainSeoConfig {
  return DOMAIN_SEO_CONFIGS[domain];
}

/**
 * Generate Next.js Metadata for a product domain's landing page.
 * This is the primary function used by page.tsx and layout.tsx files.
 */
export function generateDomainMetadata(
  host: string,
  overrides?: { title?: string; description?: string },
): Metadata {
  const domain = resolveProductDomain(host);
  const config = DOMAIN_SEO_CONFIGS[domain];
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocalhost ? "http" : "https";
  const baseUrl = isLocalhost ? `${protocol}://${host}` : config.canonicalBase;

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: overrides?.title || config.title,
      template: config.titleTemplate,
    },
    description: overrides?.description || config.description,
    keywords: config.keywords,
    alternates: {
      canonical: baseUrl,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large" as const,
        "max-snippet": -1,
      },
    },
    openGraph: {
      type: config.og.type,
      locale: config.og.locale,
      siteName: config.og.siteName,
      title: overrides?.title || config.title,
      description: overrides?.description || config.description,
      url: baseUrl,
      images: [
        {
          url: config.og.image,
          width: 1200,
          height: 630,
          alt: config.og.imageAlt,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: overrides?.title || config.title,
      description: overrides?.description || config.description,
      site: config.twitter.site,
      creator: config.twitter.handle,
      images: [config.og.image],
    },
    applicationName: config.og.siteName,
    category: "Technology",
    creator: config.og.siteName,
    publisher: "Flowauxi",
    other: {
      "theme-color": config.themeColor,
    },
  };
}

// =============================================================================
// JSON-LD STRUCTURED DATA GENERATORS
// =============================================================================

/**
 * Generate Organization + WebSite JSON-LD for a product domain.
 * Returns array of schema objects ready for <script type="application/ld+json">.
 */
export function generateDomainSchemas(host: string): Record<string, unknown>[] {
  const domain = resolveProductDomain(host);
  const config = DOMAIN_SEO_CONFIGS[domain];
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const baseUrl = isLocalhost ? `http://${host}` : config.canonicalBase;

  const schemas: Record<string, unknown>[] = [];

  // Organization Schema — establishes the domain as a unique entity in Google
  schemas.push({
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${baseUrl}/#organization`,
    name: config.organization.name,
    url: config.organization.url,
    description: config.organization.description,
    logo: {
      "@type": "ImageObject",
      "@id": `${baseUrl}/#logo`,
      url: config.organization.logo,
      contentUrl: config.organization.logo,
      caption: config.organization.name,
    },
    image: config.organization.logo,
    sameAs: config.organization.sameAs,
    parentOrganization: {
      "@type": "Organization",
      name: "Flowauxi Technologies",
      url: "https://www.flowauxi.com",
    },
  });

  // WebSite Schema — enables sitelinks search box in Google
  schemas.push({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${baseUrl}/#website`,
    name: config.website.name,
    url: baseUrl,
    description: config.website.description,
    publisher: { "@id": `${baseUrl}/#organization` },
    inLanguage: config.og.locale === "en_IN" ? "en-IN" : "en-US",
  });

  // WebPage Schema — the landing page itself
  schemas.push({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${baseUrl}/#webpage`,
    name: config.title,
    url: baseUrl,
    description: config.description,
    isPartOf: { "@id": `${baseUrl}/#website` },
    about: { "@id": `${baseUrl}/#organization` },
    inLanguage: config.og.locale === "en_IN" ? "en-IN" : "en-US",
  });

  // SoftwareApplication Schema — each domain is a distinct product
  schemas.push({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: config.og.siteName,
    url: baseUrl,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any",
    description: config.description,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "INR",
      description: "Free tier available",
    },
    creator: {
      "@type": "Organization",
      name: "Flowauxi Technologies",
    },
  });

  return schemas;
}
