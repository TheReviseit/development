import type { Metadata } from "next";

/**
 * Enterprise SEO Metadata for /apis landing page
 * Optimized for: OTP API, WhatsApp verification, SMS verification, 2FA API
 */
export const apisPageMetadata: Metadata = {
  title: "OTP Verification API | WhatsApp & SMS Authentication - Flowauxi",
  description:
    "Enterprise-grade OTP verification API for WhatsApp and SMS. Sub-200ms delivery, 99.9% uptime SLA, bank-grade security. Start free with 100+ integrations.",
  keywords: [
    "OTP API",
    "OTP verification API",
    "WhatsApp OTP API",
    "SMS verification API",
    "two-factor authentication API",
    "2FA API",
    "phone verification API",
    "OTP service India",
    "WhatsApp business API",
    "mobile verification",
    "one-time password API",
    "authentication API",
    "verify phone number API",
    "OTP gateway India",
    "transactional OTP",
    "login verification",
    "signup verification",
  ],
  authors: [{ name: "Flowauxi", url: "https://flowauxi.com" }],
  creator: "Flowauxi",
  publisher: "Flowauxi",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL("https://api.flowauxi.com"),
  alternates: {
    canonical: "https://api.flowauxi.com/apis",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://api.flowauxi.com/apis",
    siteName: "Flowauxi OTP API",
    title: "OTP Verification API | Enterprise WhatsApp & SMS Authentication",
    description:
      "Production-grade OTP API with sub-200ms delivery via WhatsApp and SMS. Bank-grade security, 99.9% uptime, and developer-friendly SDKs.",
    images: [
      {
        url: "https://api.flowauxi.com/og-api-home.png",
        width: 1200,
        height: 630,
        alt: "Flowauxi OTP Verification API - Enterprise WhatsApp & SMS Authentication",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@flowauxi",
    creator: "@flowauxi",
    title: "OTP Verification API | WhatsApp & SMS Auth",
    description:
      "Enterprise OTP API with sub-200ms delivery. Bank-grade security, 99.9% uptime SLA.",
    images: ["https://api.flowauxi.com/og-api-home.png"],
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "your-google-verification-code",
  },
  category: "Technology",
  classification: "API Service",
};

/**
 * JSON-LD Structured Data for /apis page
 * Includes: Organization, WebApplication, SoftwareApplication, FAQPage
 */
export const apisPageJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://flowauxi.com/#organization",
      name: "Flowauxi",
      url: "https://flowauxi.com",
      logo: {
        "@type": "ImageObject",
        url: "https://flowauxi.com/logo.png",
        width: 512,
        height: 512,
      },
      sameAs: [
        "https://twitter.com/flowauxi",
        "https://linkedin.com/company/flowauxi",
        "https://github.com/flowauxi",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        telephone: "+91-XXXXXXXXXX",
        contactType: "sales",
        email: "sales@flowauxi.com",
        availableLanguage: ["English", "Hindi"],
      },
    },
    {
      "@type": "WebApplication",
      "@id": "https://api.flowauxi.com/#webapp",
      name: "Flowauxi OTP API",
      description:
        "Enterprise-grade OTP verification API for WhatsApp and SMS with sub-200ms delivery",
      url: "https://api.flowauxi.com/apis",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "All",
      offers: {
        "@type": "AggregateOffer",
        lowPrice: "799",
        highPrice: "10000",
        priceCurrency: "INR",
        offerCount: 3,
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.9",
        reviewCount: "127",
        bestRating: "5",
        worstRating: "1",
      },
      featureList: [
        "WhatsApp OTP delivery",
        "SMS OTP delivery",
        "Sub-200ms response time",
        "99.9% uptime SLA",
        "Bank-grade security",
        "Webhook notifications",
        "Rate limit protection",
        "Sandbox mode for testing",
      ],
      provider: {
        "@type": "Organization",
        "@id": "https://flowauxi.com/#organization",
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "Flowauxi OTP API",
      applicationCategory: "WebApplication",
      applicationSubCategory: "Security API",
      offers: {
        "@type": "Offer",
        price: "799",
        priceCurrency: "INR",
        priceValidUntil: "2027-12-31",
      },
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://api.flowauxi.com/apis#breadcrumb",
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
          name: "API Overview",
          item: "https://api.flowauxi.com/apis",
        },
      ],
    },
  ],
};
