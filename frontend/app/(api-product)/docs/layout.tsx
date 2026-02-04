/**
 * /docs Layout - SEO Metadata Export
 */

import type { Metadata } from "next";
import Script from "next/script";
import { docsPageMetadata, docsPageJsonLd } from "./metadata";

export const metadata: Metadata = docsPageMetadata;

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* JSON-LD Structured Data */}
      <Script
        id="docs-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(docsPageJsonLd),
        }}
        strategy="beforeInteractive"
      />
      {children}
    </>
  );
}
