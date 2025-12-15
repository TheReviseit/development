import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { PWAInstallPrompt } from "@/components/pwa/PWAInstallPrompt";

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

// Comprehensive SEO Metadata Configuration
export const metadata: Metadata = {
  metadataBase: new URL("https://www.reviseit.in"),

  // Primary Meta Tags - Enhanced for better CTR
  title: {
    default: "ReviseIt - AI WhatsApp Automation Platform | Free Trial",
    template: "%s | ReviseIt",
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
    { name: "ReviseIt Team", url: "https://www.reviseit.in" },
    { name: "ReviseIt Support", url: "https://www.reviseit.in" },
  ],
  creator: "ReviseIt - WhatsApp Automation Platform",
  publisher: "ReviseIt Technologies",

  // App Configuration
  applicationName: "ReviseIt",
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
    url: "https://www.reviseit.in",
    siteName: "ReviseIt - WhatsApp Automation Platform",
    title: "ReviseIt - AI WhatsApp Automation Platform | Free Trial",
    description:
      "Transform your WhatsApp into a powerful business tool with AI automation. Get instant customer responses, automated follow-ups, and CRM integration. Trusted by 500+ businesses. Start free!",
    images: [
      {
        url: "https://www.reviseit.in/og-image.png",
        secureUrl: "https://www.reviseit.in/og-image.png",
        width: 1200,
        height: 630,
        alt: "ReviseIt - AI-Powered WhatsApp Automation Platform for Business",
        type: "image/png",
      },
      {
        url: "https://www.reviseit.in/logo.png",
        secureUrl: "https://www.reviseit.in/logo.png",
        width: 512,
        height: 512,
        alt: "ReviseIt Logo",
        type: "image/png",
      },
    ],
  },

  // Twitter Card - Enhanced
  twitter: {
    card: "summary_large_image",
    site: "@reviseit",
    creator: "@reviseit",
    title: "ReviseIt - AI WhatsApp Automation Platform | Free Trial",
    description:
      "Transform your WhatsApp into a powerful business tool with AI automation. Get instant customer responses, automated follow-ups, and CRM integration. Start free today!",
    images: {
      url: "https://www.reviseit.in/twitter-image.png",
      alt: "ReviseIt - WhatsApp Automation Platform",
    },
  },

  // Additional Meta Tags
  category: "Business Software",
  classification: "Business Automation & Communication Software",

  // Icons and Manifest - Enhanced
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
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

  manifest: "/manifest.json",

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
    canonical: "https://www.reviseit.in",
    languages: {
      "en-US": "https://www.reviseit.in",
      "en-IN": "https://www.reviseit.in",
    },
  },

  // Additional metadata for better discovery
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "ReviseIt",
    "application-name": "ReviseIt",
    "msapplication-TileColor": "#22C15A",
    "msapplication-config": "/browserconfig.xml",
  },
};

// Enhanced Structured Data Schemas for Better SEO

// Organization Schema - Helps Google show your logo and company info
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://www.reviseit.in/#organization",
  name: "ReviseIt",
  legalName: "ReviseIt Technologies",
  description:
    "AI-Powered WhatsApp Automation and Business Messaging Platform trusted by 500+ businesses",
  url: "https://www.reviseit.in",
  logo: {
    "@type": "ImageObject",
    "@id": "https://www.reviseit.in/#logo",
    url: "https://www.reviseit.in/logo.png",
    contentUrl: "https://www.reviseit.in/logo.png",
    width: "512",
    height: "512",
    caption: "ReviseIt Logo",
  },
  image: {
    "@type": "ImageObject",
    url: "https://www.reviseit.in/og-image.png",
    width: "1200",
    height: "630",
  },
  founder: {
    "@type": "Person",
    name: "ReviseIt Team",
  },
  foundingDate: "2024",
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
      email: "support@reviseit.in",
    },
    {
      "@type": "ContactPoint",
      contactType: "Sales",
      availableLanguage: ["English"],
      email: "sales@reviseit.in",
    },
  ],
  sameAs: [
    "https://www.linkedin.com/company/reviseit",
    "https://twitter.com/reviseit",
    "https://www.facebook.com/reviseit",
  ],
  areaServed: {
    "@type": "Country",
    name: "India",
  },
  knowsAbout: [
    "WhatsApp Automation",
    "Business Messaging",
    "AI Chatbots",
    "Customer Engagement",
    "CRM Integration",
  ],
};

// Website Schema - Helps with search functionality
const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://www.reviseit.in/#website",
  name: "ReviseIt",
  url: "https://www.reviseit.in",
  description: "AI-Powered WhatsApp Automation and Business Messaging Platform",
  publisher: {
    "@id": "https://www.reviseit.in/#organization",
  },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://www.reviseit.in/search?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
  inLanguage: "en-US",
};

// WebPage Schema - For the homepage
const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": "https://www.reviseit.in/#webpage",
  url: "https://www.reviseit.in",
  name: "ReviseIt - AI WhatsApp Automation & Business Messaging Platform",
  description:
    "Transform your WhatsApp into a powerful business tool with AI automation. Get instant customer responses, automated follow-ups, and CRM integration.",
  isPartOf: {
    "@id": "https://www.reviseit.in/#website",
  },
  about: {
    "@id": "https://www.reviseit.in/#organization",
  },
  primaryImageOfPage: {
    "@type": "ImageObject",
    url: "https://www.reviseit.in/og-image.png",
  },
  datePublished: "2024-01-01",
  dateModified: new Date().toISOString(),
  inLanguage: "en-US",
};

// Software Application Schema - Describes your product
const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "ReviseIt",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Communication & Messaging",
  operatingSystem: "Web Browser, iOS, Android",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "INR",
    priceValidUntil: "2025-12-31",
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
    "@id": "https://www.reviseit.in/#organization",
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
  screenshot: "https://www.reviseit.in/og-image.png",
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
      item: "https://www.reviseit.in",
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
      name: "What is ReviseIt?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ReviseIt is an AI-powered WhatsApp automation platform that helps businesses automate customer conversations, manage messaging at scale, and integrate with CRM systems.",
      },
    },
    {
      "@type": "Question",
      name: "How does WhatsApp automation work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "ReviseIt connects to WhatsApp Business API and uses AI to automatically respond to customer messages, send broadcasts, and manage conversations based on your business rules and workflows.",
      },
    },
    {
      "@type": "Question",
      name: "Is there a free trial?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! ReviseIt offers a 14-day free trial with full access to all features. No credit card required to start.",
      },
    },
    {
      "@type": "Question",
      name: "Can I integrate ReviseIt with my CRM?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, ReviseIt integrates with popular CRM systems and business tools through our API and native integrations.",
      },
    },
  ],
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
        <meta name="apple-mobile-web-app-title" content="ReviseIt" />

        {/* Additional SEO Tags */}
        <meta name="rating" content="general" />
        <meta name="distribution" content="global" />
        <meta name="revisit-after" content="7 days" />
        <meta name="language" content="English" />
        <meta name="geo.region" content="IN" />
        <meta name="geo.placename" content="India" />

        {/* Canonical Link */}
        <link rel="canonical" href="https://www.reviseit.in" />

        {/* Alternate for hreflang */}
        <link rel="alternate" hrefLang="en" href="https://www.reviseit.in" />
        <link rel="alternate" hrefLang="en-US" href="https://www.reviseit.in" />
        <link rel="alternate" hrefLang="en-IN" href="https://www.reviseit.in" />
        <link
          rel="alternate"
          hrefLang="x-default"
          href="https://www.reviseit.in"
        />
      </head>
      <body className={`${jakarta.variable} ${outfit.variable} antialiased`}>
        <ServiceWorkerRegistration />
        <PWAInstallPrompt />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
