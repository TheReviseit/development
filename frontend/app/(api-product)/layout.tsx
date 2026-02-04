/**
 * API Product Layout
 *
 * Server component layout for api.flowauxi.com routes.
 * Dark developer-focused theme with API-specific navigation.
 */

import React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import "./api-layout.css";

// SEO for API product
export const metadata: Metadata = {
  metadataBase: new URL("https://api.flowauxi.com"),
  title: {
    default: "Flowauxi OTP API | Enterprise WhatsApp & SMS Verification",
    template: "%s | Flowauxi OTP API",
  },
  description:
    "Enterprise-grade OTP verification API for WhatsApp and SMS. Sub-200ms delivery, 99.9% uptime SLA, and developer-friendly.",
  keywords: [
    "OTP API",
    "WhatsApp OTP",
    "SMS verification API",
    "two-factor authentication",
    "2FA API",
    "phone verification",
    "OTP verification",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Flowauxi OTP API",
    title: "Enterprise OTP Verification API",
    description: "Production-grade OTP delivery via WhatsApp and SMS",
    images: [
      {
        url: "https://api.flowauxi.com/og-api.png",
        width: 1200,
        height: 630,
        alt: "Flowauxi OTP API",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@flowauxi",
    creator: "@flowauxi",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function ApiProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Get product context from headers (set by middleware)
  const headersList = await headers();
  const productContext = headersList.get("x-product-context") || "api";
  const canonicalUrl = headersList.get("x-canonical-url") || "";

  return (
    <div className="api-product-wrapper" data-product={productContext}>
      {/* Inject canonical URL */}
      {canonicalUrl && (
        <head>
          <link rel="canonical" href={canonicalUrl} />
        </head>
      )}

      {children}
    </div>
  );
}
