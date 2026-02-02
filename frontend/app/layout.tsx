import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { PWAInstallPrompt } from "@/components/pwa/PWAInstallPrompt";
import CookieConsent from "./components/CookieConsent/CookieConsent";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: true,
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: true,
});

import type { Viewport } from "next";

// Viewport Configuration for Mobile Responsiveness
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#22C15A" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
  ],
};

// Comprehensive SEO Metadata Configuration
export const metadata: Metadata = {
  metadataBase: new URL("https://www.flowauxi.com"),

  // Primary Meta Tags - Enhanced for better CTR
  title: {
    default: "Flowauxi - AI WhatsApp Automation Platform | Free Trial",
    template: "%s | Flowauxi",
  },
  description:
    "Transform your WhatsApp into a powerful business tool with AI automation. Get instant customer responses, automated follow-ups, and CRM integration. Trusted by 500+ businesses. Start your 14-day free trial today!",
  keywords: [
    // Primary keywords
    "WhatsApp automation",
    "WhatsApp business API",
    "AI WhatsApp chatbot",
    "WhatsApp automation tool",
    "WhatsApp business automation",
    // Secondary keywords
    "automated WhatsApp messages",
    "WhatsApp marketing automation",
    "WhatsApp CRM integration",
    "WhatsApp broadcast messages",
    "WhatsApp API integration",
    // Long-tail keywords
    "automate WhatsApp customer support",
    "WhatsApp automation for small business",
    "AI-powered WhatsApp responses",
    "WhatsApp messaging platform India",
    "WhatsApp Cloud API solution",
    // Related terms
    "conversational AI chatbot",
    "customer engagement platform",
    "business messaging solution",
    "multi-channel messaging",
    "automated customer support",
  ],
  authors: [
    { name: "Flowauxi Team", url: "https://www.flowauxi.com" },
    { name: "Flowauxi Support", url: "https://www.flowauxi.com" },
  ],
  creator: "Flowauxi - WhatsApp Automation Platform",
  publisher: "Flowauxi Technologies",

  // App Configuration
  applicationName: "Flowauxi",
  generator: "Next.js 16",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    telephone: true,
    email: true,
    address: true,
  },

  // Robots Configuration - Optimized
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // Open Graph (Facebook, LinkedIn, WhatsApp) - Enhanced
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.flowauxi.com",
    siteName: "Flowauxi - WhatsApp Automation Platform",
    title: "Flowauxi - AI WhatsApp Automation Platform | Free Trial",
    description:
      "Transform your WhatsApp into a powerful business tool with AI automation. Get instant customer responses, automated follow-ups, and CRM integration. Trusted by 500+ businesses. Start free!",
    images: [
      {
        url: "https://www.flowauxi.com/og-image.png",
        secureUrl: "https://www.flowauxi.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "Flowauxi - AI-Powered WhatsApp Automation Platform for Business",
        type: "image/png",
      },
      {
        url: "https://www.flowauxi.com/logo.png",
        secureUrl: "https://www.flowauxi.com/logo.png",
        width: 512,
        height: 512,
        alt: "Flowauxi Logo",
        type: "image/png",
      },
    ],
  },

  // Twitter Card - Enhanced
  twitter: {
    card: "summary_large_image",
    site: "@flowauxi",
    creator: "@flowauxi",
    title: "Flowauxi - AI WhatsApp Automation Platform | Free Trial",
    description:
      "Transform your WhatsApp into a powerful business tool with AI automation. Get instant customer responses, automated follow-ups, and CRM integration. Start free today!",
    images: {
      url: "https://www.flowauxi.com/twitter-image.png",
      alt: "Flowauxi - WhatsApp Automation Platform",
    },
  },

  // Additional Meta Tags
  category: "Business Software",
  classification: "Business Automation & Communication Software",

  // Icons and Manifest - Enhanced with all sizes for Google
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico" }],
    other: [
      {
        rel: "mask-icon",
        url: "/logo.svg",
        color: "#22C15A",
      },
    ],
  },

  // Verification - Ready for verification codes
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION,
    yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION,
    other: {
      "msvalidate.01": process.env.NEXT_PUBLIC_BING_VERIFICATION || "",
    },
  },

  // Alternate Languages and Canonical
  alternates: {
    canonical: "https://www.flowauxi.com",
    languages: {
      "en-US": "https://www.flowauxi.com",
      "en-IN": "https://www.flowauxi.com",
    },
  },

  // Additional metadata for better discovery
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "Flowauxi",
    "application-name": "Flowauxi",
    "msapplication-TileColor": "#22C15A",
    "msapplication-config": "/browserconfig.xml",
  },
};

// Enhanced Structured Data Schemas for Better SEO

// Organization Schema - Helps Google show your logo and company info
// Enhanced with entity disambiguation and third-party trust signals
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://www.flowauxi.com/#organization",
  name: "Flowauxi",
  legalName: "Flowauxi Technologies",
  // Alternate names help Google disambiguate from similar-sounding brands like "Floweraura"
  alternateName: [
    "flowauxi",
    "Flowauxi.com",
    "Flow Auxi",
    "FlowAuxi",
    "Flowauxi AI",
  ],
  description:
    "AI-Powered WhatsApp Automation and Business Messaging Platform trusted by 500+ businesses",
  // Explicit disambiguation - tells Google exactly what we are NOT
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
  founder: {
    "@type": "Person",
    name: "Flowauxi Team",
  },
  foundingDate: "2024",
  // Industry Classification Codes - Critical for entity categorization
  naics: "541512", // Computer Systems Design Services
  isicV4: "6201", // Computer programming activities
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
  // Enhanced sameAs with third-party trust signals (critical for Knowledge Graph)
  sameAs: [
    // Social Profiles
    "https://www.linkedin.com/company/flowauxi",
    "https://twitter.com/flowauxi",
    "https://www.facebook.com/flowauxi",
    "https://www.youtube.com/@flowauxi",
    "https://github.com/flowauxi",
    // Third-party Trust Signals - Massive for Google Trust
    "https://www.crunchbase.com/organization/flowauxi",
    "https://www.producthunt.com/products/flowauxi",
    "https://www.trustpilot.com/review/flowauxi.com",
  ],
  areaServed: {
    "@type": "Country",
    name: "India",
  },
  knowsAbout: [
    "WhatsApp Automation",
    "WhatsApp Business API",
    "Business Messaging",
    "AI Chatbots",
    "Customer Engagement",
    "CRM Integration",
    "Conversational AI",
    "Marketing Automation",
  ],
  knowsLanguage: ["en", "hi"],
  keywords: "WhatsApp API, Business Automation, Flowauxi AI, CRM Integration",
};

// Website Schema - Helps with search functionality
const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://www.flowauxi.com/#website",
  name: "Flowauxi",
  url: "https://www.flowauxi.com",
  description: "AI-Powered WhatsApp Automation and Business Messaging Platform",
  publisher: {
    "@id": "https://www.flowauxi.com/#organization",
  },
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

// WebPage Schema - For the homepage
const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": "https://www.flowauxi.com/#webpage",
  url: "https://www.flowauxi.com",
  name: "Flowauxi - AI WhatsApp Automation & Business Messaging Platform",
  description:
    "Transform your WhatsApp into a powerful business tool with AI automation. Get instant customer responses, automated follow-ups, and CRM integration.",
  isPartOf: {
    "@id": "https://www.flowauxi.com/#website",
  },
  about: {
    "@id": "https://www.flowauxi.com/#organization",
  },
  primaryImageOfPage: {
    "@type": "ImageObject",
    url: "https://www.flowauxi.com/og-image.png",
  },
  datePublished: "2024-01-01",
  dateModified: new Date().toISOString(),
  inLanguage: "en-US",
};

// Software Application Schema - Describes your product
const softwareAppSchema = {
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
  creator: {
    "@id": "https://www.flowauxi.com/#organization",
  },
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

// BreadcrumbList Schema - Helps with site navigation in search
const breadcrumbSchema = {
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

// FAQ Schema - Add this if you have FAQ section
const faqSchema = {
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

// Brand Schema - Explicit brand entity for Knowledge Graph disambiguation
// This tells Google that "Flowauxi" is a distinct brand, not a typo for "Floweraura"
const brandSchema = {
  "@context": "https://schema.org",
  "@type": "Brand",
  "@id": "https://www.flowauxi.com/#brand",
  name: "Flowauxi",
  // Alternate names catch common misspellings and variations
  alternateName: [
    "flowauxi",
    "Flowauxi.com",
    "Flow Auxi",
    "FlowAuxi",
    "Flowauxi AI",
  ],
  description: "AI-Powered WhatsApp Automation Platform for Business",
  // Critical: This explicitly tells Google what Flowauxi is NOT
  disambiguatingDescription:
    "A specialized AI software platform for WhatsApp Business automation, distinct from retail or gifting services.",
  slogan: "Transform WhatsApp into Your Business Superpower",
  logo: "https://www.flowauxi.com/icon-512.png",
  url: "https://www.flowauxi.com",
  // Keywords for additional context
  keywords:
    "WhatsApp API, Business Automation, Flowauxi AI, CRM Integration, AI Chatbot",
  // Link to parent organization
  brand: {
    "@id": "https://www.flowauxi.com/#organization",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" prefix="og: https://ogp.me/ns#">
      <head>
        {/* DNS Prefetch for Performance */}
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        <link rel="dns-prefetch" href="https://fonts.googleapis.com" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />

        {/* Preconnect for faster loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />

        {/* Explicit Favicon Links for Google & Browser Compatibility */}
        <link rel="icon" type="image/x-icon" href="/favicon.ico" sizes="any" />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="48x48"
          href="/favicon-48x48.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/icon-192.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="512x512"
          href="/icon-512.png"
        />

        {/* Structured Data - Organization (Critical for Logo in Google) */}
        <script
          id="organization-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />

        {/* Structured Data - Website */}
        <script
          id="website-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteSchema),
          }}
        />

        {/* Structured Data - WebPage */}
        <script
          id="webpage-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(webPageSchema),
          }}
        />

        {/* Structured Data - Software Application */}
        <script
          id="software-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(softwareAppSchema),
          }}
        />

        {/* Structured Data - Breadcrumb */}
        <script
          id="breadcrumb-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbSchema),
          }}
        />

        {/* Structured Data - FAQ */}
        <script
          id="faq-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqSchema),
          }}
        />

        {/* Structured Data - Brand (Critical for Knowledge Graph disambiguation) */}
        <script
          id="brand-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(brandSchema),
          }}
        />

        {/* Theme Colors */}
        <meta name="theme-color" content="#22C15A" />
        <meta name="msapplication-TileColor" content="#22C15A" />
        <meta name="msapplication-TileImage" content="/icon-512.png" />

        {/* Apple-specific meta tags */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Flowauxi" />

        {/* Additional SEO Tags */}
        <meta name="rating" content="general" />
        <meta name="distribution" content="global" />
        <meta name="revisit-after" content="7 days" />
        <meta name="language" content="English" />
        <meta name="geo.region" content="IN" />
        <meta name="geo.placename" content="India" />

        {/* Canonical Link */}
        <link rel="canonical" href="https://www.flowauxi.com" />

        {/* Alternate for hreflang */}
        <link rel="alternate" hrefLang="en" href="https://www.flowauxi.com" />
        <link
          rel="alternate"
          hrefLang="en-US"
          href="https://www.flowauxi.com"
        />
        <link
          rel="alternate"
          hrefLang="en-IN"
          href="https://www.flowauxi.com"
        />
        <link
          rel="alternate"
          hrefLang="x-default"
          href="https://www.flowauxi.com"
        />
      </head>
      <body className={`${jakarta.variable} ${outfit.variable} antialiased`}>
        <ServiceWorkerRegistration />
        <PWAInstallPrompt />
        <CookieConsent />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
