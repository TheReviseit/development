/**
 * Store Page — Server Component with Enterprise SEO
 *
 * This is the public-facing store page for multi-tenant merchants.
 * Each store has completely independent SEO:
 *   - Unique <title>, <meta description>, <link rel="canonical">
 *   - Unique Open Graph & Twitter Card tags
 *   - Product JSON-LD structured data (Google Rich Results)
 *   - Organization JSON-LD (per-tenant entity)
 *   - BreadcrumbList JSON-LD (navigation hierarchy)
 *
 * Architecture:
 *   1. generateMetadata() → SEO meta tags (server-side, before render)
 *   2. StorePage() → JSON-LD injection + client page hydration
 *
 * Multi-tenant canonical safety:
 *   shop1.com/store/a → canonical shop1.com/store/a
 *   shop2.com/store/a → canonical shop2.com/store/a
 *   (No cross-domain duplicate content)
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/product
 */

import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getStoreBySlug } from "@/lib/store";
import { generateStoreMetadata } from "@/lib/seo/store-metadata";
import { generateAllStoreSchemas } from "@/lib/seo/product-schema";
import StoreClientPage from "./client-page";

// =============================================================================
// ISR CONFIGURATION
// =============================================================================
// Revalidate every 60 seconds — balances freshness with performance.
// Products updated in the dashboard will reflect within 60s.
// For instant updates, use on-demand revalidation via API route.
export const revalidate = 60;

// =============================================================================
// METADATA GENERATION (runs server-side before page render)
// =============================================================================

interface StorePageProps {
  params: Promise<{ username: string }>;
}

/**
 * Generate SEO metadata for this specific store.
 * Every store gets unique title, description, OG tags, canonical, etc.
 */
export async function generateMetadata({
  params,
}: StorePageProps): Promise<Metadata> {
  const { username } = await params;

  // Resolve host for canonical URL generation
  const headersList = await headers();
  const host = headersList.get("host") || "www.flowauxi.com";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocalhost ? "http" : "https";

  // Fetch store data — same function used by the page
  const storeData = await getStoreBySlug(username);

  // If store doesn't exist, return minimal metadata (notFound will render)
  if (!storeData) {
    return {
      title: "Store Not Found",
      description: "This store does not exist or is no longer active.",
      robots: { index: false, follow: false },
    };
  }

  // Use canonical slug if available (handles username → slug redirects)
  const slug = storeData.canonicalSlug || username;

  return generateStoreMetadata({
    store: storeData,
    slug,
    host,
    protocol: protocol as "http" | "https",
  });
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default async function StorePage({ params }: StorePageProps) {
  const { username } = await params;

  if (!username || username.length < 1) {
    notFound();
  }

  console.log(`[StorePage SSR] Fetching store for: "${username}"`);
  const storeData = await getStoreBySlug(username);
  console.log(`[StorePage SSR] Result: ${storeData ? "FOUND" : "NULL"}`);

  if (!storeData) {
    notFound();
  }

  // ── CANONICAL REDIRECT ─────────────────────────────────────────────
  // If the URL slug doesn't match the canonical slug, redirect.
  // This handles: username → slug, mixed case → lowercase, UID → slug
  if (
    storeData.canonicalSlug &&
    username.toLowerCase() !== storeData.canonicalSlug.toLowerCase()
  ) {
    console.log(
      `[StorePage SSR] Redirecting ${username} → ${storeData.canonicalSlug}`,
    );
    redirect(`/store/${storeData.canonicalSlug}`);
  }

  // ── STRUCTURED DATA ────────────────────────────────────────────────
  // Generate all JSON-LD schemas for this store
  const headersList = await headers();
  const host = headersList.get("host") || "www.flowauxi.com";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocalhost ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;
  const storeUrl = `${baseUrl}/store/${storeData.canonicalSlug || username}`;

  const schemas = generateAllStoreSchemas({
    store: storeData,
    storeUrl,
    baseUrl,
    slug: storeData.canonicalSlug || username,
  });

  return (
    <>
      {/* JSON-LD Structured Data — injected server-side for crawlers */}
      {schemas.map((schema, i) => (
        <script
          key={`store-schema-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}

      {/* Client-side interactive store */}
      <StoreClientPage username={username} initialData={storeData} />
    </>
  );
}
