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
  name: "Flowauxi - AI WhatsApp Automation & Business Messaging Platform",
  description:
    "Transform your WhatsApp into a powerful business tool with AI automation. Get instant customer responses, automated follow-ups, and CRM integration.",
  isPartOf: { "@id": "https://www.flowauxi.com/#website" },
  about: { "@id": "https://www.flowauxi.com/#organization" },
  primaryImageOfPage: {
    "@type": "ImageObject",
    url: "https://www.flowauxi.com/og-image.png",
  },
  datePublished: "2024-01-01",
  dateModified: BUILD_DATE, // Fixed: was new Date().toISOString() causing hydration mismatch
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
  applicationSubCategory: "Communication & Messaging",
  operatingSystem: "Web Browser, iOS, Android",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "INR",
    priceValidUntil: "2026-12-31",
    availability: "https://schema.org/InStock",
    description: "14-day free trial available",
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
    "AI-powered WhatsApp automation platform for businesses. Automate customer responses, manage conversations, and integrate with your CRM.",
  featureList: [
    "AI-Powered Auto-Responses",
    "Smart Broadcasting",
    "CRM Integration",
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
      name: "What is Flowauxi?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Flowauxi is an AI-powered WhatsApp automation platform that helps businesses automate customer conversations, manage messaging at scale, and integrate with CRM systems.",
      },
    },
    {
      "@type": "Question",
      name: "How does WhatsApp automation work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Flowauxi connects to WhatsApp Business API and uses AI to automatically respond to customer messages, send broadcasts, and manage conversations based on your business rules and workflows.",
      },
    },
    {
      "@type": "Question",
      name: "Is there a free trial?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! Flowauxi offers a 14-day free trial with full access to all features. No credit card required to start.",
      },
    },
    {
      "@type": "Question",
      name: "Can I integrate Flowauxi with my CRM?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, Flowauxi integrates with popular CRM systems and business tools through our API and native integrations.",
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
  faqSchema,
  brandSchema,
];
