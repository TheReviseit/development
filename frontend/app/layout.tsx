import type { Metadata } from "next";
import { headers } from "next/headers";
import { Outfit, Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import { PWAInstallPrompt } from "@/components/pwa/PWAInstallPrompt";
import CookieConsent from "./components/CookieConsent/CookieConsent";
import { ALL_SCHEMAS } from "@/lib/seo/structured-data";
import {
  resolveProductDomain,
  generateDomainMetadata,
  generateDomainSchemas,
} from "@/lib/seo/domain-seo";
import QueryProvider from "./components/providers/QueryProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  preload: true,
});

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

// Base SEO Metadata Configuration (Static elements)
const baseMetadata: Metadata = {
  // Primary Meta Tags - Enhanced for better CTR
  title: {
    default: "Flowauxi — AI WhatsApp Automation Platform",
    template: "%s | Flowauxi",
  },
  description:
    "Transform your WhatsApp into a powerful business tool with AI automation. Get instant customer responses, automated follow-ups, and CRM integration. Trusted by 500+ businesses. Get started today!",
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
    // OTP API keywords
    "OTP API",
    "OTP verification API",
    "WhatsApp OTP",
    "SMS OTP API",
    "phone verification API",
    "2FA API",
    "two-factor authentication",
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
    siteName: "Flowauxi - WhatsApp Automation Platform",
    title: "Flowauxi — AI WhatsApp Automation Platform",
    description:
      "Transform your WhatsApp into a powerful business tool with AI automation. Get instant customer responses, automated follow-ups, and CRM integration. Trusted by 500+ businesses. Start free!",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Flowauxi - AI-Powered WhatsApp Automation Platform for Business",
        type: "image/png",
      },
      {
        url: "/logo.png",
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
    title: "Flowauxi — AI WhatsApp Automation Platform",
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

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") || "www.flowauxi.com";
  const domain = resolveProductDomain(host);
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocalhost ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  // Subdomains: use domain-specific metadata (title, desc, canonical, OG)
  if (domain !== "dashboard") {
    return generateDomainMetadata(host);
  }

  // Main domain: use the full baseMetadata
  return {
    ...baseMetadata,
    metadataBase: new URL(baseUrl),
    alternates: {
      canonical: baseUrl,
      languages: {
        "en-US": baseUrl,
        "en-IN": baseUrl,
      },
    },
    openGraph: {
      ...baseMetadata.openGraph,
      url: baseUrl,
    },
  };
}

/**
 * Root Layout — Domain-Aware Schema Firewall
 *
 * CRITICAL: Structured data injection is now domain-aware.
 * - Main domain (www.flowauxi.com): injects ALL_SCHEMAS (Organization, WebSite, FAQ, Brand)
 * - Subdomains: injects domain-specific schemas from generateDomainSchemas()
 *   with correct schema types (Store, SoftwareApplication, APIReference, WebApplication)
 *
 * This prevents Google from seeing conflicting Organization entities on subdomains.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const host = headersList.get("host") || "www.flowauxi.com";
  const domain = resolveProductDomain(host);

  // Schema firewall: subdomains get their own schemas, main domain gets ALL_SCHEMAS
  const schemas =
    domain === "dashboard" ? ALL_SCHEMAS : generateDomainSchemas(host);

  return (
    <html
      lang="en"
      prefix="og: https://ogp.me/ns#"
      data-scroll-behavior="smooth"
    >
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

        {/* Domain-Aware Structured Data — SCHEMA FIREWALL */}
        {/* Main domain: ALL_SCHEMAS (Organization, WebSite, SoftwareApp, FAQ, Brand) */}
        {/* Subdomains: domain-specific schemas (Store/WebApp/APIRef + FAQ + Breadcrumb) */}
        {schemas.map((schema, i) => (
          <script
            key={`schema-${i}`}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
      </head>
      <body className={`${inter.variable} ${jakarta.variable} ${outfit.variable} antialiased`}>
        <QueryProvider>
          <ServiceWorkerRegistration />
          <PWAInstallPrompt />
          <CookieConsent />
          {children}
          <SpeedInsights />
        </QueryProvider>
      </body>
    </html>
  );
}
