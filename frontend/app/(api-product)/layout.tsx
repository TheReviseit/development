/**
 * API Product Layout — Domain-Aware SEO
 *
 * Server component layout for api.flowauxi.com routes.
 * Dark developer-focused theme with API-specific navigation.
 *
 * IMPORTANT: Do NOT inject schemas here — the root layout.tsx
 * already handles domain-aware schema injection via the schema firewall.
 * Injecting here would cause DUPLICATE schemas that Google penalizes.
 */

import React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import "./api-layout.css";
import { generateDomainMetadata } from "@/lib/seo/domain-seo";

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
  const productContext = headersList.get("x-product-context") || "api";

  return (
    <div className="api-product-wrapper" data-product={productContext}>
      {/* Schemas are injected by root layout.tsx — DO NOT duplicate here */}
      {children}
    </div>
  );
}
