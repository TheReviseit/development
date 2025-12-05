import type { Metadata } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Script from "next/script";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Comprehensive SEO Metadata Configuration
export const metadata: Metadata = {
  metadataBase: new URL("https://www.reviseit.in"),

  // Primary Meta Tags
  title: {
    default: "ReviseIt - AI-Powered WhatsApp Automation for Business",
    template: "%s | ReviseIt",
  },
  description:
    "Automate WhatsApp messaging with AI-powered responses, smart workflows, and CRM integration. Trusted by 500+ growing businesses. Start free trial today.",
  keywords: [
    "WhatsApp automation",
    "WhatsApp business API",
    "AI messaging",
    "AI WhatsApp chatbot",
    "business automation",
    "WhatsApp API",
    "CRM integration",
    "WhatsApp marketing",
    "WhatsApp broadcast",
    "automated messaging",
    "customer engagement",
    "WhatsApp Cloud API",
    "conversational AI",
    "smart automation",
  ],
  authors: [{ name: "ReviseIt Team" }],
  creator: "ReviseIt",
  publisher: "ReviseIt",

  // App Configuration
  applicationName: "ReviseIt",
  generator: "Next.js",
  referrer: "origin-when-cross-origin",

  // Robots Configuration
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

  // Open Graph (Facebook, LinkedIn, WhatsApp)
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.reviseit.in",
    siteName: "ReviseIt",
    title: "ReviseIt - AI-Powered WhatsApp Automation for Business",
    description:
      "Automate WhatsApp messaging with AI-powered responses, smart workflows, and CRM integration. Trusted by 500+ growing businesses.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ReviseIt - WhatsApp Automation Platform",
        type: "image/png",
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: "summary_large_image",
    title: "ReviseIt - AI-Powered WhatsApp Automation for Business",
    description:
      "Automate WhatsApp messaging with AI-powered responses, smart workflows, and CRM integration. Trusted by 500+ growing businesses.",
    images: ["/twitter-image.png"],
    creator: "@reviseit",
    site: "@reviseit",
  },

  // Additional Meta Tags
  category: "Business Software",
  classification: "Business Automation Software",

  // Icons and Manifest
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.ico", sizes: "16x16" },
    ],
    apple: [{ url: "/favicon.ico", sizes: "180x180" }],
    shortcut: "/favicon.ico",
  },

  // Verification (add when available)
  verification: {
    // google: "your-google-verification-code",
    // yandex: "your-yandex-verification-code",
    // bing: "your-bing-verification-code",
  },

  // Alternate Languages (if you support multiple languages)
  alternates: {
    canonical: "https://www.reviseit.in",
    languages: {
      "en-US": "https://www.reviseit.in",
    },
  },

  // Viewport (handled separately but included for reference)
  // This is now handled automatically by Next.js
};

// Structured Data Schema
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "ReviseIt",
  description: "AI-Powered WhatsApp Automation for Business",
  url: "https://www.reviseit.in",
  logo: "https://www.reviseit.in/logo.png",
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "Customer Support",
    availableLanguage: ["English"],
  },
  sameAs: [
    "https://linkedin.com/company/reviseit",
    "https://twitter.com/reviseit",
  ],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "ReviseIt",
  url: "https://reviseit.com",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://www.reviseit.in/search?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Structured Data - Organization */}
        <Script
          id="organization-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />
        {/* Structured Data - Website */}
        <Script
          id="website-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteSchema),
          }}
        />
        {/* Theme Color */}
        <meta name="theme-color" content="#22C15A" />
        <meta name="msapplication-TileColor" content="#22C15A" />
      </head>
      <body className={`${jakarta.variable} ${outfit.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
