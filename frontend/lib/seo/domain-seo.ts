/**
 * Domain SEO Configuration — FAANG-Level Multi-Domain SEO
 * =========================================================
 *
 * SINGLE SOURCE OF TRUTH for SEO across all product domains.
 * Each subdomain gets completely independent:
 *   - Title, description, keywords
 *   - Open Graph and Twitter Cards
 *   - Correct JSON-LD structured data (Store, SoftwareApplication, APIReference, WebApplication)
 *   - Canonical URL with sameAs cross-linking (NOT hreflang — that's for language variants)
 *   - Per-domain FAQ schemas (based on real People Also Ask queries)
 *   - AggregateRating for SoftwareApplication schemas
 *   - SiteLinksSearchBox via WebSite.potentialAction
 *
 * When someone searches:
 *   "Flowauxi shop"       → shop.flowauxi.com ranks
 *   "online store builder" → shop.flowauxi.com ranks (via Store schema + keyword H1)
 *   "marketing tools"     → marketing.flowauxi.com ranks
 *   "portfolio builder"   → pages.flowauxi.com ranks
 *   "WhatsApp automation" → www.flowauxi.com ranks
 *   "OTP API"             → api.flowauxi.com ranks
 *
 * Architecture:
 *   resolveProductDomain(host) → ProductDomain → getDomainSeoConfig(domain) → full SEO config
 *
 * @see https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites
 * @see https://developers.google.com/search/docs/appearance/structured-data/product
 * @see https://developers.google.com/search/docs/appearance/structured-data/software-app
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

interface DomainFAQ {
  question: string;
  answer: string;
}

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

  /** All subdomain canonical URLs — for sameAs cross-linking */
  crossDomainLinks: string[];

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

  /** Primary schema type for this domain */
  primarySchemaType: string;
  /** Secondary schema type */
  secondarySchemaType?: string;

  /** Organization info (every subdomain links to parent) */
  organization: {
    name: string;
    description: string;
    url: string;
    logo: string;
    sameAs: string[];
  };

  /** WebSite schema for SiteLinksSearchBox */
  website: {
    name: string;
    description: string;
  };

  /** AggregateRating for SoftwareApplication schema */
  rating: {
    ratingValue: string;
    ratingCount: string;
    bestRating: string;
  };

  /** FAQ questions sourced from real "People Also Ask" queries */
  faqs: DomainFAQ[];

  /** Breadcrumb trail for this domain */
  breadcrumb: { name: string; url: string }[];

  /** Theme color for PWA/browser */
  themeColor: string;
}

// =============================================================================
// CROSS-DOMAIN URLS — used for sameAs linking
// =============================================================================

const ALL_SUBDOMAIN_URLS = [
  "https://www.flowauxi.com",
  "https://shop.flowauxi.com",
  "https://marketing.flowauxi.com",
  "https://pages.flowauxi.com",
  "https://api.flowauxi.com",
];

const SOCIAL_URLS = [
  "https://www.linkedin.com/company/flowauxi",
  "https://twitter.com/flowauxi",
  "https://www.facebook.com/flowauxi",
  "https://www.youtube.com/@flowauxi",
  "https://github.com/flowauxi",
];

// =============================================================================
// DOMAIN SEO CONFIGURATIONS — THE CORE
// =============================================================================

const DOMAIN_SEO_CONFIGS: Record<ProductDomain, DomainSeoConfig> = {
  // ─────────────────────────────────────────────────────────────────────
  // SHOP — E-commerce Platform
  // Primary: Store + SoftwareApplication (merchant rich results)
  // ─────────────────────────────────────────────────────────────────────
  shop: {
    domain: "shop",
    title: "WhatsApp-Powered Online Store with Automated Order Booking | Flowauxi Shop",
    titleTemplate: "%s | Flowauxi Shop",
    description:
      "Create your free WhatsApp online store with Flowauxi. AI chatbot, order automation, invoice delivery, payment integration. Get a free website + 7-day trial. Plans start at ₹1,999/month.",
    keywords: [
      "WhatsApp store builder",
      "WhatsApp order automation",
      "WhatsApp chatbot for online store",
      "WhatsApp e-commerce platform",
      "automated order booking WhatsApp",
      "WhatsApp automation for e-commerce",
      "AI chatbot for e-commerce",
      "online store with WhatsApp integration",
      "WhatsApp CRM for e-commerce",
      "conversational commerce platform",
      "WhatsApp product catalog",
      "automate WhatsApp sales",
      "best WhatsApp store builder India",
      "D2C WhatsApp automation",
      "WhatsApp business store",
      "ecommerce WhatsApp chatbot",
      "sell online via WhatsApp",
      "WhatsApp order management",
    ],
    canonicalBase: "https://shop.flowauxi.com",
    crossDomainLinks: ALL_SUBDOMAIN_URLS.filter(
      (u) => u !== "https://shop.flowauxi.com",
    ),
    og: {
      siteName: "Flowauxi Shop",
      type: "website",
      locale: "en_IN",
      image: "https://shop.flowauxi.com/og-shop.png",
      imageAlt:
        "Flowauxi Shop — WhatsApp-Powered E-commerce Store Builder with Automated Order Booking",
    },
    twitter: {
      handle: "@flowauxi",
      site: "@flowauxi",
    },
    primarySchemaType: "Store",
    secondarySchemaType: "SoftwareApplication",
    organization: {
      name: "Flowauxi Shop",
      description:
        "WhatsApp-powered e-commerce platform enabling businesses to create online stores with automated order booking, AI chatbot for customer support, and WhatsApp CRM integration.",
      url: "https://shop.flowauxi.com",
      logo: "https://shop.flowauxi.com/icon-512.png",
      sameAs: [...SOCIAL_URLS, ...ALL_SUBDOMAIN_URLS],
    },
    website: {
      name: "Flowauxi Shop",
      description:
        "WhatsApp-Powered E-commerce Store Builder with Automated Order Booking",
    },
    rating: {
      ratingValue: "4.8",
      ratingCount: "520",
      bestRating: "5",
    },
    faqs: [
      {
        question:
          "How do I automate WhatsApp orders for my online store?",
        answer:
          "With Flowauxi Shop, you can automate WhatsApp orders by connecting your store to the WhatsApp Business API. Once connected, our AI chatbot handles incoming order requests, shares your product catalog, confirms orders, and sends automatic payment and delivery notifications — all through WhatsApp.",
      },
      {
        question:
          "What is the best WhatsApp chatbot for e-commerce businesses?",
        answer:
          "Flowauxi Shop provides an AI-powered WhatsApp chatbot specifically designed for e-commerce. It handles customer queries 24/7, shares product catalogs, processes orders, sends invoices, and manages returns — all automatically. It's trusted by thousands of online sellers in India.",
      },
      {
        question:
          "Can I build an online store with WhatsApp order automation?",
        answer:
          "Yes! Flowauxi Shop lets you create a professional online store with built-in WhatsApp order automation. Customers can browse your products, place orders via WhatsApp, and receive real-time updates on order status, shipping, and delivery — no coding required.",
      },
      {
        question: "How does WhatsApp CRM work for e-commerce?",
        answer:
          "Flowauxi Shop includes a built-in WhatsApp CRM that automatically captures customer data from conversations, tracks order history, segments your audience for targeted campaigns, and provides a unified dashboard to manage all customer interactions.",
      },
      {
        question: "What is WhatsApp conversational commerce?",
        answer:
          "WhatsApp conversational commerce is the practice of selling products and services directly through WhatsApp chat. With Flowauxi Shop, businesses can share product catalogs, accept orders, process payments, and provide customer support — all within WhatsApp conversations, creating a seamless buying experience.",
      },
    ],
    breadcrumb: [
      { name: "Flowauxi", url: "https://www.flowauxi.com" },
      { name: "Shop", url: "https://shop.flowauxi.com" },
    ],
    themeColor: "#22C15A",
  },

  // ─────────────────────────────────────────────────────────────────────
  // MARKETING — Campaign & Automation Platform
  // Primary: WebApplication + SoftwareApplication
  // ─────────────────────────────────────────────────────────────────────
  marketing: {
    domain: "marketing",
    title:
      "WhatsApp Marketing Automation — AI-Powered Campaign Platform | Flowauxi Marketing",
    titleTemplate: "%s | Flowauxi Marketing",
    description:
      "Enterprise marketing automation with AI-powered WhatsApp campaigns, multi-channel broadcasting, audience segmentation & real-time analytics. Scale your marketing across WhatsApp, SMS, and email — all in one platform.",
    keywords: [
      "flowauxi marketing",
      "WhatsApp marketing automation",
      "marketing automation platform",
      "campaign management tool",
      "WhatsApp bulk messaging",
      "marketing tools India",
      "AI marketing platform",
      "email marketing automation",
      "SMS marketing platform",
      "multi-channel marketing",
      "audience segmentation tool",
      "marketing analytics platform",
      "best WhatsApp marketing tool",
      "bulk WhatsApp messaging",
      "conversational marketing platform",
    ],
    canonicalBase: "https://marketing.flowauxi.com",
    crossDomainLinks: ALL_SUBDOMAIN_URLS.filter(
      (u) => u !== "https://marketing.flowauxi.com",
    ),
    og: {
      siteName: "Flowauxi Marketing",
      type: "website",
      locale: "en_IN",
      image: "https://marketing.flowauxi.com/og-marketing.png",
      imageAlt: "Flowauxi Marketing — AI-Powered WhatsApp Campaign Automation",
    },
    twitter: {
      handle: "@flowauxi",
      site: "@flowauxi",
    },
    primarySchemaType: "WebApplication",
    secondarySchemaType: "SoftwareApplication",
    organization: {
      name: "Flowauxi Marketing",
      description:
        "AI-powered marketing automation platform for campaign management, audience segmentation, and multi-channel broadcasting across WhatsApp, SMS, and email.",
      url: "https://marketing.flowauxi.com",
      logo: "https://marketing.flowauxi.com/icon-512.png",
      sameAs: [...SOCIAL_URLS, ...ALL_SUBDOMAIN_URLS],
    },
    website: {
      name: "Flowauxi Marketing",
      description: "AI Marketing Automation & Campaign Management Platform",
    },
    rating: {
      ratingValue: "4.7",
      ratingCount: "380",
      bestRating: "5",
    },
    faqs: [
      {
        question: "What is the best WhatsApp marketing automation tool?",
        answer:
          "Flowauxi Marketing is an enterprise-grade WhatsApp marketing automation platform with AI-powered campaigns, multi-channel broadcasting, audience segmentation, and real-time analytics. It supports WhatsApp, SMS, and email from a single dashboard.",
      },
      {
        question: "How to do bulk WhatsApp messaging legally?",
        answer:
          "Flowauxi Marketing uses the official WhatsApp Business API for compliant bulk messaging. You can send template-approved messages to opted-in contacts with audience segmentation, scheduling, and delivery analytics — all within WhatsApp's guidelines.",
      },
      {
        question: "Can Flowauxi Marketing automate campaign responses with AI?",
        answer:
          "Yes! Flowauxi Marketing includes AI-powered auto-responses that handle customer queries, follow-ups, and engagement sequences automatically. Set up intelligent workflows that trigger based on customer behavior and message content.",
      },
      {
        question: "What marketing channels does Flowauxi support?",
        answer:
          "Flowauxi Marketing supports WhatsApp, SMS, and email as primary channels. All campaigns are managed from a single dashboard with unified analytics, audience segmentation, and AI-powered optimization across all channels.",
      },
    ],
    breadcrumb: [
      { name: "Flowauxi", url: "https://www.flowauxi.com" },
      { name: "Marketing", url: "https://marketing.flowauxi.com" },
    ],
    themeColor: "#7C3AED",
  },

  // ─────────────────────────────────────────────────────────────────────
  // SHOWCASE / PAGES — Portfolio & Website Builder
  // Primary: WebApplication
  // ─────────────────────────────────────────────────────────────────────
  showcase: {
    domain: "showcase",
    title:
      "Free Portfolio Website Builder — Create Professional Showcases | Flowauxi Pages",
    titleTemplate: "%s | Flowauxi Pages",
    description:
      "Build stunning portfolio and showcase websites with Flowauxi Pages. 50+ premium templates, visual drag-and-drop builder, custom domains, SEO optimization & AI-powered content tools. Perfect for creators, freelancers, and agencies.",
    keywords: [
      "flowauxi pages",
      "portfolio website builder",
      "portfolio builder free",
      "showcase website builder",
      "professional portfolio maker",
      "freelancer portfolio",
      "creative portfolio website",
      "agency website builder",
      "online portfolio maker",
      "portfolio templates free",
      "showcase builder",
      "personal website builder",
      "best portfolio website builder",
      "how to create portfolio website",
      "drag and drop portfolio builder",
    ],
    canonicalBase: "https://pages.flowauxi.com",
    crossDomainLinks: ALL_SUBDOMAIN_URLS.filter(
      (u) => u !== "https://pages.flowauxi.com",
    ),
    og: {
      siteName: "Flowauxi Pages",
      type: "website",
      locale: "en_IN",
      image: "https://pages.flowauxi.com/og-pages.png",
      imageAlt: "Flowauxi Pages — Professional Portfolio & Showcase Builder",
    },
    twitter: {
      handle: "@flowauxi",
      site: "@flowauxi",
    },
    primarySchemaType: "WebApplication",
    organization: {
      name: "Flowauxi Pages",
      description:
        "Professional portfolio and showcase website builder with 50+ premium templates, visual editor, and AI-powered content tools for creators and businesses.",
      url: "https://pages.flowauxi.com",
      logo: "https://pages.flowauxi.com/icon-512.png",
      sameAs: [...SOCIAL_URLS, ...ALL_SUBDOMAIN_URLS],
    },
    website: {
      name: "Flowauxi Pages",
      description: "Professional Portfolio & Showcase Website Builder",
    },
    rating: {
      ratingValue: "4.9",
      ratingCount: "210",
      bestRating: "5",
    },
    faqs: [
      {
        question: "What is the best free portfolio website builder?",
        answer:
          "Flowauxi Pages is a free portfolio website builder with 50+ premium templates, drag-and-drop visual editor, custom domain support, and built-in SEO optimization. Start creating your professional portfolio in minutes — no coding required.",
      },
      {
        question: "How do I create a professional portfolio website?",
        answer:
          "With Flowauxi Pages, sign up for free, choose from 50+ professionally designed templates, customize with our drag-and-drop builder, add your work samples, and publish. Your portfolio is automatically optimized for SEO and mobile devices.",
      },
      {
        question:
          "Can I use a custom domain with Flowauxi Pages portfolio builder?",
        answer:
          "Yes! Flowauxi Pages supports custom domains so your portfolio appears on your own URL. We handle SSL certificates, CDN delivery, and DNS configuration automatically.",
      },
      {
        question:
          "Is Flowauxi Pages suitable for freelancers and creative agencies?",
        answer:
          "Absolutely. Flowauxi Pages is designed for freelancers, photographers, designers, developers, and creative agencies. Features include multi-project showcases, client testimonials, contact forms, and analytics to track visitor engagement.",
      },
    ],
    breadcrumb: [
      { name: "Flowauxi", url: "https://www.flowauxi.com" },
      { name: "Pages", url: "https://pages.flowauxi.com" },
    ],
    themeColor: "#0F766E",
  },

  // ─────────────────────────────────────────────────────────────────────
  // API — OTP & Developer Platform
  // Primary: SoftwareApplication + APIReference
  // ─────────────────────────────────────────────────────────────────────
  api: {
    domain: "api",
    title:
      "OTP Verification API — WhatsApp & SMS Authentication | Flowauxi API",
    titleTemplate: "%s | Flowauxi API",
    description:
      "Enterprise-grade OTP verification API for WhatsApp and SMS. 99.9% uptime, sub-200ms delivery, developer-friendly SDKs & documentation. Trusted by 500+ businesses. Start with free credits.",
    keywords: [
      "flowauxi api",
      "OTP API",
      "OTP verification API",
      "WhatsApp OTP API",
      "SMS verification API",
      "phone verification API",
      "2FA API",
      "two factor authentication API",
      "WhatsApp API India",
      "SMS API India",
      "OTP service provider",
      "best OTP API",
      "WhatsApp OTP API pricing",
      "developer verification API",
      "enterprise authentication API",
    ],
    canonicalBase: "https://api.flowauxi.com",
    crossDomainLinks: ALL_SUBDOMAIN_URLS.filter(
      (u) => u !== "https://api.flowauxi.com",
    ),
    og: {
      siteName: "Flowauxi API",
      type: "website",
      locale: "en_US",
      image: "https://api.flowauxi.com/og-api.png",
      imageAlt: "Flowauxi API — Enterprise OTP Verification for WhatsApp & SMS",
    },
    twitter: {
      handle: "@flowauxi",
      site: "@flowauxi",
    },
    primarySchemaType: "SoftwareApplication",
    secondarySchemaType: "APIReference",
    organization: {
      name: "Flowauxi API",
      description:
        "Enterprise OTP verification API for WhatsApp and SMS with 99.9% uptime, sub-200ms delivery, and developer-friendly SDKs.",
      url: "https://api.flowauxi.com",
      logo: "https://api.flowauxi.com/icon-512.png",
      sameAs: [...SOCIAL_URLS, ...ALL_SUBDOMAIN_URLS],
    },
    website: {
      name: "Flowauxi API",
      description: "Enterprise OTP Verification API Platform",
    },
    rating: {
      ratingValue: "4.9",
      ratingCount: "450",
      bestRating: "5",
    },
    faqs: [
      {
        question: "What is the best OTP verification API?",
        answer:
          "Flowauxi API is an enterprise-grade OTP verification service supporting both WhatsApp and SMS delivery. It offers 99.9% uptime SLA, sub-200ms delivery times, developer-friendly SDKs in multiple languages, and competitive pricing. Start with free credits — no credit card required.",
      },
      {
        question: "How much does WhatsApp OTP API cost?",
        answer:
          "Flowauxi API offers competitive pricing with a free tier that includes credits for testing. Paid plans are based on volume with per-message pricing for both WhatsApp and SMS OTPs. Enterprise plans include dedicated support, custom SLAs, and volume discounts.",
      },
      {
        question: "Can I use Flowauxi API for two-factor authentication (2FA)?",
        answer:
          "Yes! Flowauxi API is purpose-built for 2FA/OTP verification. It supports OTP delivery via WhatsApp and SMS with automatic fallback, delivery status tracking, and configurable OTP expiry times. Integrates with any backend via REST API.",
      },
      {
        question: "What programming languages does Flowauxi API support?",
        answer:
          "Flowauxi API provides SDKs for Node.js, Python, PHP, and Java, plus a comprehensive REST API that works with any language. Full API documentation, code examples, and Postman collections are available in the developer portal.",
      },
    ],
    breadcrumb: [
      { name: "Flowauxi", url: "https://www.flowauxi.com" },
      { name: "API", url: "https://api.flowauxi.com" },
    ],
    themeColor: "#2563EB",
  },

  // ─────────────────────────────────────────────────────────────────────
  // DASHBOARD — Main WhatsApp Automation Platform
  // Primary: Organization + SoftwareApplication
  // ─────────────────────────────────────────────────────────────────────
  dashboard: {
    domain: "dashboard",
    title:
      "WhatsApp Automation Platform — AI Chatbot, CRM & Business Messaging | Flowauxi",
    titleTemplate: "%s | Flowauxi",
    description:
      "Automate WhatsApp for your business with AI chatbots, CRM integration, smart broadcasting & analytics. Trusted by 500+ businesses across India. Start your free trial today — no credit card required.",
    keywords: [
      "WhatsApp automation",
      "WhatsApp automation platform",
      "WhatsApp business API",
      "AI WhatsApp chatbot",
      "WhatsApp chatbot for business",
      "WhatsApp CRM integration",
      "WhatsApp marketing automation",
      "WhatsApp automation India",
      "automate customer support WhatsApp",
      "best WhatsApp automation tool for small business",
      "WhatsApp automation for e-commerce",
      "WhatsApp order automation",
      "automated WhatsApp messages",
      "WhatsApp Cloud API solution",
      "conversational AI chatbot",
      "business messaging platform",
      "customer engagement platform",
      "flowauxi",
      "whatsapp store builder",
      "free online store builder India",
      "whatsapp ecommerce",
      "sell on whatsapp",
      "whatsapp business store",
      "whatsapp shop",
      "D2C whatsapp automation",
      "whatsapp invoice automation",
      "whatsapp payment collection",
      "order tracking whatsapp",
      "whatsapp catalog",
      "conversational commerce India",
      "whatsapp business solution",
      "AI chatbot for whatsapp store",
      "whatsapp order management",
      "whatsapp commerce platform",
      "best whatsapp chatbot for ecommerce",
      "Razorpay whatsapp integration",
      "UPI payment whatsapp",
      "GST invoice whatsapp",
      "whatsapp store Mumbai",
      "whatsapp store Delhi",
      "whatsapp store Bangalore",
      "ecommerce whatsapp automation",
      "small business whatsapp tool",
    ],
    canonicalBase: "https://www.flowauxi.com",
    crossDomainLinks: ALL_SUBDOMAIN_URLS.filter(
      (u) => u !== "https://www.flowauxi.com",
    ),
    og: {
      siteName: "Flowauxi",
      type: "website",
      locale: "en_IN",
      image: "https://www.flowauxi.com/og-image.png",
      imageAlt:
        "Flowauxi — WhatsApp Automation Platform with AI Chatbot & CRM",
    },
    twitter: {
      handle: "@flowauxi",
      site: "@flowauxi",
    },
    primarySchemaType: "Organization",
    secondarySchemaType: "SoftwareApplication",
    organization: {
      name: "Flowauxi",
      description:
        "WhatsApp Automation Platform with AI chatbots, CRM integration, and smart broadcasting. Trusted by 500+ businesses across India.",
      url: "https://www.flowauxi.com",
      logo: "https://www.flowauxi.com/icon-512.png",
      sameAs: [
        ...SOCIAL_URLS,
        ...ALL_SUBDOMAIN_URLS,
        "https://www.crunchbase.com/organization/flowauxi",
        "https://www.producthunt.com/products/flowauxi",
        "https://www.trustpilot.com/review/flowauxi.com",
      ],
    },
    website: {
      name: "Flowauxi",
      description:
        "WhatsApp Automation Platform — AI Chatbot, CRM & Business Messaging",
    },
    rating: {
      ratingValue: "4.8",
      ratingCount: "500",
      bestRating: "5",
    },
    faqs: [
      {
        question: "What is WhatsApp automation and how does it work?",
        answer:
          "WhatsApp automation uses the WhatsApp Business API to automatically handle customer conversations, send broadcasts, and trigger workflows without manual intervention. Flowauxi connects to the API and provides AI-powered auto-responses, smart broadcasting, CRM integration, and analytics — enabling businesses to manage thousands of conversations at scale.",
      },
      {
        question:
          "How much does WhatsApp automation cost for businesses?",
        answer:
          "Flowauxi offers flexible pricing plans starting with a free trial. Costs depend on message volume and features needed. Plans range from affordable starter tiers for small businesses to enterprise plans with custom SLAs. WhatsApp Business API itself charges per-conversation fees set by Meta. Start with our 14-day free trial — no credit card required.",
      },
      {
        question:
          "Is WhatsApp automation legal for business messaging in India?",
        answer:
          "Yes, WhatsApp automation is fully legal in India when using the official WhatsApp Business API. Flowauxi uses Meta's approved API channels, ensuring compliance with WhatsApp's Business Policy and Commerce Policy. All messages are sent to opted-in customers with template-approved content.",
      },
      {
        question: "What is the best WhatsApp automation platform?",
        answer:
          "Flowauxi is a leading WhatsApp automation platform trusted by 500+ businesses in India. It offers AI-powered chatbots, CRM integration, smart broadcasting, analytics dashboard, and multi-agent support. Unlike competitors, Flowauxi also includes e-commerce store building, marketing automation, and OTP verification — all from one platform.",
      },
    ],
    breadcrumb: [{ name: "Flowauxi", url: "https://www.flowauxi.com" }],
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
 *
 * Key features:
 * - Domain-specific title, description, keywords
 * - Correct canonical URL pointing to subdomain (NOT www)
 * - sameAs-style cross-domain alternates (NOT hreflang — these are different products, not language variants)
 * - OG images per subdomain
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
 * Generate ALL schemas for a product domain.
 * Returns array of schema objects ready for <script type="application/ld+json">.
 *
 * Generates CORRECT schema types per subdomain:
 *   shop      → Store + SoftwareApplication + Organization(parent) + WebSite + FAQ + BreadcrumbList
 *   api       → SoftwareApplication + APIReference + Organization(parent) + WebSite + FAQ + BreadcrumbList
 *   marketing → WebApplication + SoftwareApplication + Organization(parent) + WebSite + FAQ + BreadcrumbList
 *   showcase  → WebApplication + Organization(parent) + WebSite + FAQ + BreadcrumbList
 *   dashboard → Organization + SoftwareApplication + WebSite + FAQ + BreadcrumbList
 */
export function generateDomainSchemas(host: string): Record<string, unknown>[] {
  const domain = resolveProductDomain(host);
  const config = DOMAIN_SEO_CONFIGS[domain];
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const baseUrl = isLocalhost ? `http://${host}` : config.canonicalBase;

  const schemas: Record<string, unknown>[] = [];

  // ── 1. Organization Schema (parent link for subdomains) ──────────────
  const orgSchema: Record<string, unknown> = {
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
  };

  // Subdomains link to parent organization
  if (domain !== "dashboard") {
    orgSchema.parentOrganization = {
      "@type": "Organization",
      name: "Flowauxi Technologies",
      url: "https://www.flowauxi.com",
      "@id": "https://www.flowauxi.com/#organization",
    };
  } else {
    // Main domain gets full org details
    orgSchema.legalName = "Flowauxi Technologies";
    orgSchema.foundingDate = "2024";
    orgSchema.contactPoint = [
      {
        "@type": "ContactPoint",
        contactType: "Customer Support",
        availableLanguage: ["English", "Hindi"],
        email: "support@flowauxi.com",
      },
    ];
    orgSchema.areaServed = { "@type": "Country", name: "India" };
    orgSchema.knowsLanguage = ["en", "hi"];
  }
  schemas.push(orgSchema);

  // ── 2. Primary Schema Type (domain-specific) ────────────────────────
  if (config.primarySchemaType === "Store") {
    // Shop gets a Store entity
    schemas.push({
      "@context": "https://schema.org",
      "@type": "Store",
      "@id": `${baseUrl}/#store`,
      name: config.organization.name,
      url: baseUrl,
      description: config.description,
      image: config.organization.logo,
      brand: { "@id": `${baseUrl}/#organization` },
      priceRange: "₹",
      currenciesAccepted: "INR",
      paymentAccepted: "UPI, Credit Card, Debit Card, Net Banking",
    });
  }

  // SoftwareApplication schema (shop, api, marketing, dashboard)
  if (
    config.primarySchemaType === "SoftwareApplication" ||
    config.secondarySchemaType === "SoftwareApplication"
  ) {
    const appCategory =
      domain === "api"
        ? "DeveloperApplication"
        : domain === "shop"
          ? "BusinessApplication"
          : domain === "marketing"
            ? "BusinessApplication"
            : "BusinessApplication";

    schemas.push({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "@id": `${baseUrl}/#software`,
      name: config.og.siteName,
      url: baseUrl,
      applicationCategory: appCategory,
      operatingSystem: "Any",
      description: config.description,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
        description: "Flexible plans available — get started instantly",
        availability: "https://schema.org/InStock",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: config.rating.ratingValue,
        ratingCount: config.rating.ratingCount,
        bestRating: config.rating.bestRating,
        worstRating: "1",
      },
      creator: {
        "@type": "Organization",
        name: "Flowauxi Technologies",
        url: "https://www.flowauxi.com",
      },
    });
  }

  // WebApplication schema (marketing, showcase)
  if (config.primarySchemaType === "WebApplication") {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "WebApplication",
      "@id": `${baseUrl}/#webapp`,
      name: config.og.siteName,
      url: baseUrl,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any",
      description: config.description,
      browserRequirements: "Requires modern web browser",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "INR",
        description: "Flexible plans available — get started instantly",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: config.rating.ratingValue,
        ratingCount: config.rating.ratingCount,
        bestRating: config.rating.bestRating,
        worstRating: "1",
      },
      creator: {
        "@type": "Organization",
        name: "Flowauxi Technologies",
        url: "https://www.flowauxi.com",
      },
    });
  }

  // APIReference schema (api domain only)
  if (config.secondarySchemaType === "APIReference") {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "APIReference",
      "@id": `${baseUrl}/#api`,
      name: "Flowauxi OTP Verification API",
      url: `${baseUrl}/docs`,
      description:
        "Enterprise-grade OTP verification API for WhatsApp and SMS with sub-200ms delivery.",
      programmingLanguage: ["JavaScript", "Python", "PHP", "Java"],
      provider: { "@id": `${baseUrl}/#organization` },
    });
  }

  // ── 3. WebSite Schema (with SiteLinksSearchBox) ──────────────────────
  schemas.push({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${baseUrl}/#website`,
    name: config.website.name,
    url: baseUrl,
    description: config.website.description,
    publisher: { "@id": `${baseUrl}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
    inLanguage: config.og.locale === "en_IN" ? "en-IN" : "en-US",
  });

  // ── 4. WebPage Schema ───────────────────────────────────────────────
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

  // ── 5. FAQ Schema — REMOVED from layout-level injection ──────────────
  // FAQ schemas are now injected at the PAGE level via generateDomainFaqSchema()
  // to guarantee exactly ONE FAQPage per URL (Google requirement).

  // ── 6. Breadcrumb Schema ─────────────────────────────────────────────
  if (config.breadcrumb.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: config.breadcrumb.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: item.url,
      })),
    });
  }

  return schemas;
}

/**
 * Generate ONLY the FAQPage schema for a product domain.
 *
 * Call this from individual page components to inject exactly ONE FAQPage
 * per URL. This prevents duplicate FAQPage schemas that occur when both
 * layout.tsx and page.tsx inject FAQ schemas.
 *
 * Usage in page.tsx:
 *   const faqSchema = generateDomainFaqSchema(host);
 *   {faqSchema && (
 *     <script type="application/ld+json"
 *       dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
 *     />
 *   )}
 */
export function generateDomainFaqSchema(
  host: string,
): Record<string, unknown> | null {
  const domain = resolveProductDomain(host);
  const config = DOMAIN_SEO_CONFIGS[domain];

  if (!config.faqs || config.faqs.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: config.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}
