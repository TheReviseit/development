/**
 * /apis Layout - SEO Metadata Export
 * This layout wraps the API landing page and exports enterprise SEO metadata
 */

import type { Metadata } from "next";
import Script from "next/script";
import { apisPageMetadata, apisPageJsonLd } from "./metadata";

export const metadata: Metadata = apisPageMetadata;

export default function ApisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* JSON-LD Structured Data */}
      <Script
        id="apis-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(apisPageJsonLd),
        }}
        strategy="beforeInteractive"
      />
      {children}
    </>
  );
}
