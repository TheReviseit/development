/**
 * Structured Data Schemas for SEO
 *
 * Extracted from layout.tsx for:
 *   - Separation of concerns
 *   - Reuse across per-domain landing pages
 *   - No hydration mismatches (BUILD_DATE replaces new Date())
 *   - Easy testing and maintenance
 *
 * All schemas follow Google's structured data guidelines:
 * https://developers.google.com/search/docs/appearance/structured-data
 */

// Use build-time date to avoid server/client hydration mismatch
const BUILD_DATE =
  process.env.BUILD_DATE || new Date().toISOString().split("T")[0];

// =============================================================================
// ORGANIZATION SCHEMA
// =============================================================================

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://www.flowauxi.com/#organization",
  name: "Flowauxi",
  legalName: "Flowauxi Technologies",
  alternateName: [
    "flowauxi",
    "Flowauxi.com",
    "Flow Auxi",
    "FlowAuxi",
    "Flowauxi AI",
  ],
  description:
    "AI-Powered WhatsApp Automation and Business Messaging Platform trusted by 500+ businesses",
  disambiguatingDescription:
    "A specialized AI software platform for WhatsApp Business automation, distinct from retail or gifting services.",
  slogan: "Transform WhatsApp into Your Business Superpower",
  url: "https://www.flowauxi.com",
  logo: {
    "@type": "ImageObject",
    "@id": "https://www.flowauxi.com/#logo",
    url: "https://www.flowauxi.com/icon-512.png",
    contentUrl: "https://www.flowauxi.com/icon-512.png",
    width: "512",
    height: "512",
    caption: "Flowauxi Logo",
    inLanguage: "en-US",
  },
  image: {
    "@type": "ImageObject",
    url: "https://www.flowauxi.com/og-image.png",
    width: "1200",
    height: "630",
  },
  founder: { "@type": "Person", name: "Flowauxi Team" },
  foundingDate: "2024",
  naics: "541512",
  isicV4: "6201",
  address: {
    "@type": "PostalAddress",
    addressCountry: "IN",
    addressRegion: "India",
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "Customer Support",
      availableLanguage: ["English", "Hindi"],
      email: "support@flowauxi.com",
    },
    {
      "@type": "ContactPoint",
      contactType: "Sales",
      availableLanguage: ["English"],
      email: "sales@flowauxi.com",
    },
  ],
  sameAs: [
    "https://www.linkedin.com/company/flowauxi",
    "https://twitter.com/flowauxi",
    "https://www.facebook.com/flowauxi",
    "https://www.youtube.com/@flowauxi",
    "https://github.com/flowauxi",
    "https://www.crunchbase.com/organization/flowauxi",
    "https://www.producthunt.com/products/flowauxi",
    "https://www.trustpilot.com/review/flowauxi.com",
  ],
  areaServed: { "@type": "Country", name: "India" },
  knowsAbout: [
    "WhatsApp Automation",
    "WhatsApp Business API",
    "Business Messaging",
    "AI Chatbots",
    "Customer Engagement",
    "CRM Integration",
    "Conversational AI",
    "Marketing Automation",
    "OTP Verification API",
    "Two-Factor Authentication",
    "Phone Verification",
    "SMS OTP",
  ],
  knowsLanguage: ["en", "hi"],
  keywords:
    "WhatsApp API, Business Automation, Flowauxi AI, CRM Integration, OTP API, Phone Verification",
};

// =============================================================================
// WEBSITE SCHEMA
// =============================================================================

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://www.flowauxi.com/#website",
  name: "Flowauxi",
  url: "https://www.flowauxi.com",
  description: "AI-Powered WhatsApp Automation and Business Messaging Platform",
  publisher: { "@id": "https://www.flowauxi.com/#organization" },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://www.flowauxi.com/search?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
  inLanguage: "en-US",
};

// =============================================================================
// WEBPAGE SCHEMA (uses BUILD_DATE to avoid hydration mismatch)
// =============================================================================

export const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": "https://www.flowauxi.com/#webpage",
  url: "https://www.flowauxi.com",
  name: "WhatsApp Automation Platform — AI Chatbot, CRM & Business Messaging | Flowauxi",
  description:
    "Automate WhatsApp for your business with AI chatbots, CRM integration, smart broadcasting & analytics. Trusted by 500+ businesses across India.",
  isPartOf: { "@id": "https://www.flowauxi.com/#website" },
  about: { "@id": "https://www.flowauxi.com/#organization" },
  primaryImageOfPage: {
    "@type": "ImageObject",
    url: "https://www.flowauxi.com/og-image.png",
  },
  datePublished: "2024-01-01",
  dateModified: BUILD_DATE,
  inLanguage: "en-US",
};

// =============================================================================
// SOFTWARE APPLICATION SCHEMA
// =============================================================================

export const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Flowauxi",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "E-commerce Automation & Business Messaging",
  operatingSystem: "Web Browser, iOS, Android",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "INR",
    priceValidUntil: "2026-12-31",
    availability: "https://schema.org/InStock",
    description: "Flexible plans available — get started instantly",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    ratingCount: "500",
    bestRating: "5",
    worstRating: "1",
  },
  creator: { "@id": "https://www.flowauxi.com/#organization" },
  description:
    "WhatsApp automation platform for businesses. Automate customer conversations, manage e-commerce orders, send broadcasts, and integrate with your CRM — all powered by AI.",
  featureList: [
    "AI-Powered WhatsApp Chatbot",
    "WhatsApp Order Automation",
    "E-commerce WhatsApp Store Builder",
    "WhatsApp CRM & Customer Management",
    "Smart Broadcasting & Campaigns",
    "Automated Invoice Generation",
    "WhatsApp Product Catalog Sharing",
    "Analytics Dashboard",
    "Multi-Agent Support",
    "Template Management",
  ],
  screenshot: "https://www.flowauxi.com/og-image.png",
};

// =============================================================================
// BREADCRUMB SCHEMA
// =============================================================================

export const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://www.flowauxi.com",
    },
  ],
};

// =============================================================================
// FAQ SCHEMA
// =============================================================================

export const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is WhatsApp automation?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "WhatsApp automation uses the WhatsApp Business API to automatically handle customer conversations, send broadcasts, and trigger workflows without manual intervention. Platforms like Flowauxi provide AI-powered auto-responses, smart broadcasting, CRM integration, and analytics — enabling businesses to manage thousands of conversations at scale.",
      },
    },
    {
      "@type": "Question",
      name: "How does WhatsApp business automation work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Flowauxi connects to the WhatsApp Business API and uses AI to automatically respond to customer messages, send targeted broadcasts, manage conversations, and trigger workflows based on your business rules. Setup takes minutes with no coding required. It works for e-commerce order automation, customer support, and marketing campaigns.",
      },
    },
    {
      "@type": "Question",
      name: "Is Flowauxi the best WhatsApp automation tool?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Flowauxi is a leading WhatsApp automation platform trusted by 500+ businesses in India. It uniquely combines AI chatbots, CRM, e-commerce store building, marketing automation, and OTP verification — all from one platform. Unlike competitors focused on just messaging, Flowauxi provides a complete business automation stack.",
      },
    },
    {
      "@type": "Question",
      name: "How to automate WhatsApp for e-commerce?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "To automate WhatsApp for e-commerce, sign up for Flowauxi, connect your WhatsApp Business API, and set up your AI chatbot. The chatbot handles product inquiries, processes orders, sends invoices, and manages delivery updates — all through WhatsApp. You can also use the built-in store builder at shop.flowauxi.com for a complete WhatsApp-powered e-commerce experience.",
      },
    },
  ],
};

// =============================================================================
// BRAND SCHEMA
// =============================================================================

export const brandSchema = {
  "@context": "https://schema.org",
  "@type": "Brand",
  "@id": "https://www.flowauxi.com/#brand",
  name: "Flowauxi",
  alternateName: [
    "flowauxi",
    "Flowauxi.com",
    "Flow Auxi",
    "FlowAuxi",
    "Flowauxi AI",
  ],
  description: "AI-Powered WhatsApp Automation Platform for Business",
  disambiguatingDescription:
    "A specialized AI software platform for WhatsApp Business automation, distinct from retail or gifting services.",
  slogan: "Transform WhatsApp into Your Business Superpower",
  logo: "https://www.flowauxi.com/icon-512.png",
  url: "https://www.flowauxi.com",
  keywords:
    "WhatsApp API, Business Automation, Flowauxi AI, CRM Integration, AI Chatbot",
  brand: { "@id": "https://www.flowauxi.com/#organization" },
};

// =============================================================================
// ALL SCHEMAS (for convenience)
// =============================================================================

export const ALL_SCHEMAS = [
  organizationSchema,
  websiteSchema,
  webPageSchema,
  softwareAppSchema,
  breadcrumbSchema,
  // faqSchema — REMOVED: FAQ is now injected at the PAGE level, not layout level
  // This prevents duplicate FAQPage schemas per URL (Google requirement)
  brandSchema,
];
