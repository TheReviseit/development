/**
 * API Product Layout — Domain-Aware SEO
 *
 * Server component layout for api.flowauxi.com routes.
 * Dark developer-focused theme with API-specific navigation.
 *
 * FIXED: Replaced static `export const metadata` with dynamic
 * `generateMetadata()` using domain-seo.ts for correct schema types
 * (SoftwareApplication + APIReference) and domain-specific metadata.
 */

import React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import "./api-layout.css";
import {
  generateDomainMetadata,
  generateDomainSchemas,
} from "@/lib/seo/domain-seo";

// Dynamic SEO — uses domain-seo.ts for correct SoftwareApplication + APIReference schemas
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") || "api.flowauxi.com";
  return generateDomainMetadata(host);
}

export default async function ApiProductLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const host = headersList.get("host") || "api.flowauxi.com";
  const productContext = headersList.get("x-product-context") || "api";
  const schemas = generateDomainSchemas(host);

  return (
    <div className="api-product-wrapper" data-product={productContext}>
      {/* Domain-specific structured data (SoftwareApplication + APIReference + FAQ) */}
      {schemas.map((schema, i) => (
        <script
          key={`api-schema-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      {children}
    </div>
  );
}
