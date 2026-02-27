/**
 * Store Metadata Generator — Enterprise SEO
 * ==========================================
 *
 * Generates Next.js `Metadata` dynamically for multi-tenant store pages.
 * Each store gets unique, SEO-optimized meta tags based on real data.
 *
 * Used by:
 *   - app/store/[username]/page.tsx (generateMetadata)
 *
 * Follows:
 *   - Google Search Central guidelines
 *   - Open Graph Protocol 1.0
 *   - Twitter Card specification
 *   - Multi-tenant canonical isolation
 *
 * @see https://developers.google.com/search/docs/appearance/title-link
 * @see https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
 */

import type { Metadata } from "next";
import type { PublicStore, StoreProduct } from "@/lib/store";

// =============================================================================
// TYPES
// =============================================================================

interface StoreMetadataOptions {
  /** Store data from Supabase */
  store: PublicStore;
  /** URL slug used in the current request */
  slug: string;
  /** Full host header (e.g. "www.flowauxi.com" or "shop1.mydomain.com") */
  host: string;
  /** Protocol — "http" for localhost, "https" for production */
  protocol: "http" | "https";
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

/**
 * Generate complete Next.js Metadata for a store page.
 *
 * This produces:
 * - <title> with store name + category context
 * - <meta name="description"> from real product data
 * - <link rel="canonical"> pointing to THIS specific store (multi-tenant safe)
 * - Open Graph tags with store logo
 * - Twitter card tags
 * - Proper robots directives
 * - Alternates for language targeting
 */
export function generateStoreMetadata({
  store,
  slug,
  host,
  protocol,
}: StoreMetadataOptions): Metadata {
  const baseUrl = `${protocol}://${host}`;
  const storeUrl = `${baseUrl}/store/${slug}`;
  const storeName = store.businessName || "Store";

  // ── Title ─────────────────────────────────────────────────────────
  // Google recommends titles under 60 characters for optimal display.
  // Format: "{Store Name} — Shop Online | {Category Count} Categories"
  const categoryCount = store.categories?.length || 0;
  const productCount = store.products?.length || 0;
  const titleSuffix =
    categoryCount > 0
      ? `${categoryCount} Categories, ${productCount}+ Products`
      : `${productCount}+ Products Online`;
  const title = truncate(`${storeName} — ${titleSuffix}`, 60);

  // ── Description ───────────────────────────────────────────────────
  // Google shows ~155-160 characters. Include key info: brand, products, location.
  const topCategories = (store.categories || []).slice(0, 4).join(", ");
  const locationStr = buildLocationString(store);
  const descriptionParts = [
    `Shop ${storeName}`,
    topCategories ? `for ${topCategories}` : "",
    locationStr ? `in ${locationStr}` : "online",
    productCount > 0 ? `— ${productCount}+ products available.` : "",
    "Fast delivery. Secure checkout.",
  ].filter(Boolean);
  const description = truncate(descriptionParts.join(" "), 160);

  // ── Keywords ──────────────────────────────────────────────────────
  const keywords = buildKeywords(store);

  // ── OG Image ──────────────────────────────────────────────────────
  // Use store logo if available, otherwise use first product image,
  // otherwise fall back to platform default.
  const ogImage = resolveOgImage(store, baseUrl);

  return {
    // MetadataBase enables relative → absolute URL resolution for OG images
    metadataBase: new URL(baseUrl),

    // Primary Meta
    title,
    description,
    keywords,

    // Canonical — CRITICAL for multi-tenant SEO isolation
    // shop1.com/store/a → canonical shop1.com/store/a
    // shop2.com/store/a → canonical shop2.com/store/a
    // This prevents cross-domain duplicate content issues.
    alternates: {
      canonical: storeUrl,
    },

    // Robots — index active stores, noindex inactive
    robots: {
      index: store.storeActive,
      follow: true,
      nocache: false,
      googleBot: {
        index: store.storeActive,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large" as const,
        "max-snippet": -1,
      },
    },

    // Open Graph — Facebook, LinkedIn, WhatsApp sharing
    openGraph: {
      type: "website",
      locale: "en_IN",
      siteName: storeName,
      title: truncate(`${storeName} — Shop Online`, 65),
      description: truncate(description, 200),
      url: storeUrl,
      images: ogImage
        ? [
            {
              url: ogImage,
              width: 1200,
              height: 630,
              alt: `${storeName} — Online Store`,
              type: "image/png",
            },
          ]
        : undefined,
    },

    // Twitter Card — X/Twitter sharing
    twitter: {
      card: "summary_large_image",
      title: truncate(`${storeName} — Shop Online`, 65),
      description: truncate(description, 200),
      images: ogImage ? [ogImage] : undefined,
    },

    // Additional metadata
    category: "Shopping",
    creator: storeName,
    publisher: storeName,
    applicationName: storeName,

    // Structured alternates for language — safe for India market
    other: {
      "geo.region": store.location?.state ? `IN-${store.location.state}` : "IN",
      "geo.placename": store.location?.city || "India",
    },
  };
}

// =============================================================================
// PRODUCT-LEVEL METADATA (for future product detail pages)
// =============================================================================

interface ProductMetadataOptions extends StoreMetadataOptions {
  product: StoreProduct;
}

/**
 * Generate metadata for a specific product page.
 * Uses Product-specific title, description, and image.
 */
export function generateProductMetadata({
  store,
  product,
  slug,
  host,
  protocol,
}: ProductMetadataOptions): Metadata {
  const baseUrl = `${protocol}://${host}`;
  const productUrl = `${baseUrl}/store/${slug}/product/${product.id}`;
  const storeName = store.businessName || "Store";

  const title = truncate(`${product.name} — Buy at ${storeName}`, 60);

  const price = formatPrice(product.price);
  const descParts = [
    product.description || product.name,
    `Price: ${price}.`,
    product.category ? `Category: ${product.category}.` : "",
    `Shop from ${storeName} with secure checkout.`,
  ].filter(Boolean);
  const description = truncate(descParts.join(" "), 160);

  const ogImage =
    product.imageUrl || store.logoUrl || `${baseUrl}/og-image.png`;

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    alternates: { canonical: productUrl },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "en_IN",
      siteName: storeName,
      title,
      description,
      url: productUrl,
      images: ogImage
        ? [{ url: ogImage, width: 800, height: 800, alt: product.name }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function formatPrice(price: number): string {
  return `₹${price.toLocaleString("en-IN")}`;
}

function buildLocationString(store: PublicStore): string {
  const parts = [store.location?.city, store.location?.state].filter(Boolean);
  return parts.join(", ");
}

function buildKeywords(store: PublicStore): string[] {
  const kw: string[] = [];
  const name = store.businessName;

  // Store name variations
  kw.push(name, `${name} online`, `${name} shop`, `buy from ${name}`);

  // Category keywords
  (store.categories || []).forEach((cat) => {
    kw.push(cat, `buy ${cat}`, `${cat} online`, `${name} ${cat}`);
  });

  // Location keywords
  if (store.location?.city) {
    kw.push(
      `${name} ${store.location.city}`,
      `online store ${store.location.city}`,
    );
  }

  // Top product names (first 5)
  (store.products || []).slice(0, 5).forEach((p) => {
    kw.push(p.name);
  });

  return kw.slice(0, 30); // Google recommends < 30 keywords
}

function resolveOgImage(store: PublicStore, baseUrl: string): string {
  // Priority: store logo → first product image → platform default
  if (store.logoUrl) return store.logoUrl;

  const firstProduct = (store.products || []).find((p) => p.imageUrl);
  if (firstProduct?.imageUrl) return firstProduct.imageUrl;

  return `${baseUrl}/og-image.png`;
}
