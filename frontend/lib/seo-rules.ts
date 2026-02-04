/**
 * SEO Rules for Multi-Product Domain Routing
 *
 * Enforces:
 * - Canonical URLs per product domain
 * - noindex on wrong-domain pages
 * - Proper meta tags for each product
 */

import { ProductContext, getDomainConfig } from "./domain-policy";

// =============================================================================
// TYPES
// =============================================================================

export interface SeoMeta {
  canonical: string;
  robots: "index,follow" | "noindex,nofollow";
  title: string;
  description: string;
}

// =============================================================================
// PRODUCT-SPECIFIC SEO DEFAULTS
// =============================================================================

const PRODUCT_SEO = {
  api: {
    titleSuffix: "Flowauxi OTP API",
    defaultDescription:
      "Enterprise-grade OTP verification API for WhatsApp and SMS. 99.9% uptime, sub-second delivery, developer-friendly.",
    ogImage: "https://api.flowauxi.com/og-api.png",
  },
  dashboard: {
    titleSuffix: "Flowauxi",
    defaultDescription:
      "AI-powered WhatsApp automation platform. Automate messaging, manage leads, and scale your business.",
    ogImage: "https://flowauxi.com/og-image.png",
  },
};

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Get SEO meta tags for a page based on product and pathname.
 *
 * @param product - Current product context
 * @param pathname - Current page path
 * @param isCorrectDomain - Whether page is on correct domain
 * @param customTitle - Optional custom title for page
 */
export function getSeoMeta(
  product: ProductContext,
  pathname: string,
  isCorrectDomain: boolean,
  customTitle?: string,
): SeoMeta {
  const config = getDomainConfig(product);
  const productSeo = PRODUCT_SEO[product];

  // Build canonical URL
  const canonical = `${config.seoBase}${pathname}`;

  // Determine robots directive
  const robots = isCorrectDomain ? "index,follow" : "noindex,nofollow";

  // Build title
  const title = customTitle
    ? `${customTitle} | ${productSeo.titleSuffix}`
    : productSeo.titleSuffix;

  return {
    canonical,
    robots,
    title,
    description: productSeo.defaultDescription,
  };
}

/**
 * Get structured data for product.
 */
export function getProductStructuredData(product: ProductContext) {
  if (product === "api") {
    return {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Flowauxi OTP API",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      url: "https://api.flowauxi.com",
      description: "Enterprise OTP verification API for WhatsApp and SMS",
      offers: {
        "@type": "Offer",
        price: "799",
        priceCurrency: "INR",
        priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
      },
    };
  }

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Flowauxi",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any",
    url: "https://flowauxi.com",
    description: "AI-powered WhatsApp automation platform",
  };
}

/**
 * Get Open Graph tags for product.
 */
export function getProductOgTags(
  product: ProductContext,
  customTitle?: string,
  customDescription?: string,
) {
  const productSeo = PRODUCT_SEO[product];
  const config = getDomainConfig(product);

  return {
    siteName: product === "api" ? "Flowauxi OTP API" : "Flowauxi",
    type: "website",
    locale: "en_US",
    url: config.seoBase,
    title: customTitle || productSeo.titleSuffix,
    description: customDescription || productSeo.defaultDescription,
    images: [
      {
        url: productSeo.ogImage,
        width: 1200,
        height: 630,
        alt:
          product === "api"
            ? "Flowauxi OTP API"
            : "Flowauxi WhatsApp Automation",
      },
    ],
  };
}
