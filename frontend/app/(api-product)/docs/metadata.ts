import type { Metadata } from "next";

/**
 * Enterprise SEO Metadata for /docs page
 * Optimized for: API documentation, developer docs, OTP integration guide
 */
export const docsPageMetadata: Metadata = {
  title: "API Documentation | OTP Integration Guide - Flowauxi",
  description:
    "Complete API documentation for Flowauxi OTP verification. Quick start guides, endpoint references, code examples in cURL, JavaScript, Python. SDKs and webhooks.",
  keywords: [
    "OTP API documentation",
    "WhatsApp OTP integration",
    "SMS verification docs",
    "API reference",
    "developer documentation",
    "OTP quickstart guide",
    "authentication API docs",
    "2FA integration guide",
    "OTP API endpoints",
    "webhook documentation",
    "OTP SDK documentation",
    "verify phone number API docs",
    "send OTP API",
    "verify OTP API",
  ],
  authors: [{ name: "Flowauxi", url: "https://flowauxi.com" }],
  creator: "Flowauxi",
  publisher: "Flowauxi",
  metadataBase: new URL("https://api.flowauxi.com"),
  alternates: {
    canonical: "https://api.flowauxi.com/docs",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://api.flowauxi.com/docs",
    siteName: "Flowauxi OTP API",
    title: "API Documentation | Flowauxi OTP Integration Guide",
    description:
      "Complete API reference with quickstart guides, endpoint documentation, and code examples for WhatsApp & SMS OTP verification.",
    images: [
      {
        url: "https://api.flowauxi.com/og-docs.png",
        width: 1200,
        height: 630,
        alt: "Flowauxi API Documentation",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@flowauxi",
    creator: "@flowauxi",
    title: "OTP API Documentation | Flowauxi",
    description:
      "Complete integration guide with code examples for WhatsApp & SMS OTP.",
    images: ["https://api.flowauxi.com/og-docs.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

/**
 * JSON-LD Structured Data for Docs Page
 * Includes: TechArticle, HowTo, BreadcrumbList
 */
export const docsPageJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://api.flowauxi.com/docs#article",
      headline: "Flowauxi OTP API Documentation",
      description:
        "Complete technical documentation for integrating OTP verification via WhatsApp and SMS",
      author: {
        "@type": "Organization",
        name: "Flowauxi",
        url: "https://flowauxi.com",
      },
      publisher: {
        "@type": "Organization",
        name: "Flowauxi",
        logo: {
          "@type": "ImageObject",
          url: "https://flowauxi.com/logo.png",
        },
      },
      datePublished: "2024-01-01",
      dateModified: new Date().toISOString().split("T")[0],
      mainEntityOfPage: "https://api.flowauxi.com/docs",
      articleSection: [
        "Getting Started",
        "Authentication",
        "Endpoints",
        "Reference",
      ],
      keywords: [
        "OTP API",
        "WhatsApp verification",
        "SMS verification",
        "two-factor authentication",
      ],
      dependencies: "None",
      proficiencyLevel: "Beginner to Advanced",
    },
    {
      "@type": "HowTo",
      "@id": "https://api.flowauxi.com/docs#quickstart",
      name: "How to Send OTP via Flowauxi API",
      description:
        "Quick start guide to send your first OTP in under 5 minutes",
      totalTime: "PT5M",
      estimatedCost: {
        "@type": "MonetaryAmount",
        currency: "INR",
        value: "0.75",
      },
      step: [
        {
          "@type": "HowToStep",
          name: "Get Your API Key",
          text: "Navigate to the API Keys section in your console and create a new key. You'll receive a key starting with otp_live_ for production or otp_test_ for sandbox mode.",
          position: 1,
        },
        {
          "@type": "HowToStep",
          name: "Send Your First OTP",
          text: "Make a POST request to /v1/otp/send with your phone number, purpose, and channel parameters.",
          position: 2,
        },
        {
          "@type": "HowToStep",
          name: "Verify the OTP",
          text: "After your user enters the OTP, verify it using the request_id from the send response.",
          position: 3,
        },
      ],
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://api.flowauxi.com",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Documentation",
          item: "https://api.flowauxi.com/docs",
        },
      ],
    },
    {
      "@type": "WebPage",
      "@id": "https://api.flowauxi.com/docs#webpage",
      url: "https://api.flowauxi.com/docs",
      name: "API Documentation | Flowauxi OTP API",
      isPartOf: {
        "@id": "https://api.flowauxi.com/#website",
      },
      about: {
        "@id": "https://api.flowauxi.com/docs#article",
      },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: "https://api.flowauxi.com/og-docs.png",
      },
    },
  ],
};
