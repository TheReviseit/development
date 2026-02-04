import type { Metadata } from "next";

/**
 * Enterprise SEO Metadata for /apis/pricing page
 * Optimized for: OTP pricing, API pricing, WhatsApp OTP cost
 */
export const pricingPageMetadata: Metadata = {
  title: "OTP API Pricing | Affordable WhatsApp & SMS Verification - Flowauxi",
  description:
    "Transparent OTP API pricing starting at ₹799/month. WhatsApp OTPs from ₹0.60/OTP. No hidden fees, pay-as-you-go billing. Enterprise volume discounts available.",
  keywords: [
    "OTP API pricing",
    "WhatsApp OTP cost",
    "SMS verification pricing",
    "OTP service cost India",
    "cheap OTP API",
    "affordable 2FA API",
    "bulk OTP pricing",
    "enterprise OTP pricing",
    "OTP gateway rates",
    "WhatsApp business API cost",
    "transactional SMS pricing",
    "verification API pricing",
  ],
  authors: [{ name: "Flowauxi", url: "https://flowauxi.com" }],
  creator: "Flowauxi",
  publisher: "Flowauxi",
  metadataBase: new URL("https://api.flowauxi.com"),
  alternates: {
    canonical: "https://api.flowauxi.com/apis/pricing",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://api.flowauxi.com/apis/pricing",
    siteName: "Flowauxi OTP API",
    title: "OTP API Pricing | Plans from ₹799/month",
    description:
      "Simple, transparent pricing for OTP verification. Pay monthly + per-OTP usage. Starter, Growth, and Enterprise plans available.",
    images: [
      {
        url: "https://api.flowauxi.com/og-pricing.png",
        width: 1200,
        height: 630,
        alt: "Flowauxi OTP API Pricing - Plans from ₹799/month",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@flowauxi",
    creator: "@flowauxi",
    title: "OTP API Pricing | ₹799/month + Usage",
    description:
      "WhatsApp OTPs from ₹0.60. No hidden fees. Enterprise discounts.",
    images: ["https://api.flowauxi.com/og-pricing.png"],
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
 * JSON-LD Structured Data for Pricing Page
 * Includes: Product with Offers, PriceSpecification, FAQ
 */
export const pricingPageJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Product",
      "@id": "https://api.flowauxi.com/apis/pricing#product",
      name: "Flowauxi OTP API",
      description:
        "Enterprise OTP verification API for WhatsApp and SMS with sub-200ms delivery",
      brand: {
        "@type": "Brand",
        name: "Flowauxi",
      },
      offers: [
        {
          "@type": "Offer",
          "@id": "https://api.flowauxi.com/apis/pricing#starter",
          name: "Starter Plan",
          description: "Perfect for MVPs and early-stage startups",
          price: "799",
          priceCurrency: "INR",
          priceValidUntil: "2027-12-31",
          availability: "https://schema.org/InStock",
          url: "https://api.flowauxi.com/apis/pricing",
          seller: {
            "@type": "Organization",
            name: "Flowauxi",
          },
        },
        {
          "@type": "Offer",
          "@id": "https://api.flowauxi.com/apis/pricing#growth",
          name: "Growth Plan",
          description: "Built for growing products with higher OTP volume",
          price: "1999",
          priceCurrency: "INR",
          priceValidUntil: "2027-12-31",
          availability: "https://schema.org/InStock",
          url: "https://api.flowauxi.com/apis/pricing",
          seller: {
            "@type": "Organization",
            name: "Flowauxi",
          },
        },
        {
          "@type": "Offer",
          "@id": "https://api.flowauxi.com/apis/pricing#enterprise",
          name: "Enterprise Plan",
          description: "For high-volume businesses and enterprises",
          priceSpecification: {
            "@type": "PriceSpecification",
            price: "Custom",
            priceCurrency: "INR",
          },
          availability: "https://schema.org/InStock",
          url: "https://api.flowauxi.com/apis/pricing",
          seller: {
            "@type": "Organization",
            name: "Flowauxi",
          },
        },
      ],
    },
    {
      "@type": "FAQPage",
      "@id": "https://api.flowauxi.com/apis/pricing#faq",
      mainEntity: [
        {
          "@type": "Question",
          name: "Are there any free OTPs?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. There are no free OTPs on any plan. Every OTP sent is billed. However, sandbox/testing mode is available for development without real OTP delivery.",
          },
        },
        {
          "@type": "Question",
          name: "How does billing work?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Monthly plan fee + usage charges apply. OTP usage is billed per successful send. Unused OTP credits do not roll over.",
          },
        },
        {
          "@type": "Question",
          name: "Can I switch plans anytime?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes! You can upgrade your plan at any time. Changes take effect immediately.",
          },
        },
        {
          "@type": "Question",
          name: "What payment methods do you accept?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "We accept all major credit cards, debit cards, UPI, and net banking through Razorpay. Enterprise customers can pay via invoice.",
          },
        },
        {
          "@type": "Question",
          name: "Do you offer volume discounts?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes, enterprise plans include custom pricing based on volume. Contact our sales team at sales@flowauxi.com for a personalized quote.",
          },
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
          name: "API Overview",
          item: "https://api.flowauxi.com/apis",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Pricing",
          item: "https://api.flowauxi.com/apis/pricing",
        },
      ],
    },
  ],
};
