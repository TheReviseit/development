/**
 * SEO Constants for Flowauxi
 * ==========================
 * Centralized configuration for brand entity signaling and SEO optimization.
 * These constants ensure consistent brand representation across all schemas and metadata.
 *
 * @author Flowauxi Team
 * @version 1.0.0
 */

// =============================================================================
// BRAND IDENTITY
// =============================================================================

export const BRAND = {
  name: "Flowauxi",
  legalName: "Flowauxi Technologies",

  // Alternate names help Google disambiguate from similar-sounding brands
  alternateNames: [
    "flowauxi",
    "Flowauxi.com",
    "Flow Auxi",
    "FlowAuxi",
    "Flowauxi AI",
  ],

  slogan: "Transform WhatsApp into Your Business Superpower",
  tagline: "AI WhatsApp Automation Platform",

  // Explicit disambiguation for Knowledge Graph separation from "Floweraura"
  disambiguatingDescription:
    "A specialized AI software platform for WhatsApp Business automation, distinct from retail or gifting services.",

  description:
    "AI-Powered WhatsApp Automation and Business Messaging Platform trusted by 500+ businesses",

  // SEO-optimized keywords for schema.org
  keywords:
    "WhatsApp API, Business Automation, Flowauxi AI, CRM Integration, AI Chatbot",

  foundingDate: "2024",

  // Contact information
  email: {
    support: "support@flowauxi.com",
    sales: "sales@flowauxi.com",
  },
} as const;

// =============================================================================
// URLS & SOCIAL PROFILES
// =============================================================================

export const URLS = {
  base: "https://www.flowauxi.com",

  // Social profiles for sameAs links - critical for entity establishment
  social: {
    linkedin: "https://www.linkedin.com/company/flowauxi",
    twitter: "https://twitter.com/flowauxi",
    facebook: "https://www.facebook.com/flowauxi",
    youtube: "https://www.youtube.com/@flowauxi",
    github: "https://github.com/flowauxi",
  },

  // Third-party verification profiles - massive for Google Trust
  thirdParty: {
    crunchbase: "https://www.crunchbase.com/organization/flowauxi",
    productHunt: "https://www.producthunt.com/products/flowauxi",
    trustpilot: "https://www.trustpilot.com/review/flowauxi.com",
  },

  // All sameAs links combined for schema
  get sameAs(): string[] {
    return [
      // Social Profiles
      this.social.linkedin,
      this.social.twitter,
      this.social.facebook,
      this.social.youtube,
      this.social.github,
      // Third-party Trust Signals
      this.thirdParty.crunchbase,
      this.thirdParty.productHunt,
      this.thirdParty.trustpilot,
    ];
  },

  // Asset URLs
  assets: {
    logo: "https://www.flowauxi.com/icon-512.png",
    ogImage: "https://www.flowauxi.com/og-image.png",
    twitterImage: "https://www.flowauxi.com/twitter-image.png",
  },
} as const;

// =============================================================================
// INDUSTRY CLASSIFICATION
// =============================================================================

export const INDUSTRY = {
  // NAICS (North American Industry Classification System)
  naics: "541512", // Computer Systems Design Services

  // ISIC v4 (International Standard Industrial Classification)
  isicV4: "6201", // Computer programming activities

  category: "Business Software",
  classification: "Business Automation & Communication Software",

  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Communication & Messaging",
} as const;

// =============================================================================
// LOCALIZATION
// =============================================================================

export const LOCALE = {
  primaryLanguage: "en-US",
  supportedLanguages: ["en", "hi"],

  address: {
    country: "IN",
    region: "India",
  },

  areaServed: {
    "@type": "Country",
    name: "India",
  },
} as const;

// =============================================================================
// SCHEMA IDENTIFIERS
// =============================================================================

export const SCHEMA_IDS = {
  organization: `${URLS.base}/#organization`,
  website: `${URLS.base}/#website`,
  brand: `${URLS.base}/#brand`,
  webpage: `${URLS.base}/#webpage`,
  logo: `${URLS.base}/#logo`,
} as const;

// =============================================================================
// EXPERTISE AREAS (for knowsAbout)
// =============================================================================

export const EXPERTISE = [
  "WhatsApp Automation",
  "WhatsApp Business API",
  "Business Messaging",
  "AI Chatbots",
  "Customer Engagement",
  "CRM Integration",
  "Conversational AI",
  "Marketing Automation",
] as const;

// =============================================================================
// SOFTWARE FEATURES
// =============================================================================

export const FEATURES = [
  "AI-Powered Auto-Responses",
  "Smart Broadcasting",
  "CRM Integration",
  "Analytics Dashboard",
  "Multi-Agent Support",
  "Template Management",
  "Automated Follow-ups",
  "Customer Segmentation",
] as const;

// =============================================================================
// THEME COLORS
// =============================================================================

export const THEME = {
  primary: "#22C15A",
  dark: "#0f0f0f",
} as const;
