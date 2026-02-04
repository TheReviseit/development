/**
 * /apis/pricing Layout - SEO Metadata Export
 */

import type { Metadata } from "next";
import Script from "next/script";
import { pricingPageMetadata, pricingPageJsonLd } from "./metadata";

export const metadata: Metadata = pricingPageMetadata;

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* JSON-LD Structured Data */}
      <Script
        id="pricing-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(pricingPageJsonLd),
        }}
        strategy="beforeInteractive"
      />
      {children}
    </>
  );
}
