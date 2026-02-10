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
  shop: {
    titleSuffix: "Flowauxi Shop",
    defaultDescription:
      "Manage your products, orders, and inventory with Flowauxi's e-commerce platform. Streamline your online business.",
    ogImage: "https://shop.flowauxi.com/og-shop.png",
  },
  showcase: {
    titleSuffix: "Flowauxi Showcase",
    defaultDescription:
      "Create beautiful product catalogs and portfolios. Showcase your products with style.",
    ogImage: "https://showcase.flowauxi.com/og-showcase.png",
  },
  marketing: {
    titleSuffix: "Flowauxi Marketing",
    defaultDescription:
      "Run powerful campaigns and bulk messaging. Reach your customers at scale with Flowauxi's marketing tools.",
    ogImage: "https://marketing.flowauxi.com/og-marketing.png",
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

  if (product === "shop") {
    return {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Flowauxi Shop",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any",
      url: "https://shop.flowauxi.com",
      description: "E-commerce platform for managing products and orders",
    };
  }

  if (product === "showcase") {
    return {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Flowauxi Showcase",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any",
      url: "https://showcase.flowauxi.com",
      description: "Product catalog and portfolio platform",
    };
  }

  if (product === "marketing") {
    return {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Flowauxi Marketing",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Any",
      url: "https://marketing.flowauxi.com",
      description: "Campaign and bulk messaging platform",
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

  // Determine site name based on product
  let siteName = "Flowauxi";
  if (product === "api") siteName = "Flowauxi OTP API";
  else if (product === "shop") siteName = "Flowauxi Shop";
  else if (product === "showcase") siteName = "Flowauxi Showcase";
  else if (product === "marketing") siteName = "Flowauxi Marketing";

  // Determine alt text based on product
  let altText = "Flowauxi WhatsApp Automation";
  if (product === "api") altText = "Flowauxi OTP API";
  else if (product === "shop") altText = "Flowauxi Shop";
  else if (product === "showcase") altText = "Flowauxi Showcase";
  else if (product === "marketing") altText = "Flowauxi Marketing";

  return {
    siteName,
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
        alt: altText,
      },
    ],
  };
}
