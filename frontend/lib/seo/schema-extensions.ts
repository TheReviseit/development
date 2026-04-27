/**
 * Schema Extensions — Additional Structured Data Generators
 * ===========================================================
 *
 * Generates Google-compliant JSON-LD for:
 *   - HowTo (step-by-step guides on landing pages)
 *   - LocalBusiness (city pages for programmatic SEO)
 *   - Review (testimonial schemas — ONLY when ENABLE_REVIEWS is true)
 *   - Pricing (SoftwareApplication + Offer/AggregateOffer for pricing sections)
 *
 * These supplement the existing schemas in structured-data.ts and
 * domain-seo.ts. Used by money keyword landing pages and programmatic
 * city/industry/country pages.
 *
 * CRITICAL: Review schemas are gated by ENABLE_REVIEWS. Do NOT
 * ship Review or AggregateRating schemas with fabricated data.
 * See entity-definition.ts for the single source of truth.
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/how-to
 * @see https://developers.google.com/search/docs/appearance/structured-data/local-business
 * @see https://developers.google.com/search/docs/appearance/structured-data/review-snippet
 */

import { getReviewRating } from "./entity-definition";

// =============================================================================
// TYPES
// =============================================================================

export interface HowToStep {
  name: string;
  text: string;
  url?: string;
  image?: string;
  position: number;
}

// =============================================================================
// HOW-TO SCHEMA
// =============================================================================

/**
 * Generate HowTo structured data for step-by-step guides.
 *
 * Used on money keyword landing pages to earn rich snippets
 * for "how to create an online store" type queries.
 *
 * Each step should correspond to a real action the user can take.
 * Include url for steps that link to signup or feature pages.
 */
export function generateHowToSchema(howTo: {
  name: string;
  description: string;
  totalTime?: string;
  estimatedCost?: { currency: string; value: string };
  supply?: string[];
  tool?: string[];
  steps: HowToStep[];
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: howTo.name,
    description: howTo.description,
    ...(howTo.totalTime ? { totalTime: howTo.totalTime } : {}),
    ...(howTo.estimatedCost
      ? {
          estimatedCost: {
            "@type": "MonetaryAmount",
            currency: howTo.estimatedCost.currency,
            value: howTo.estimatedCost.value,
          },
        }
      : {}),
    ...(howTo.supply
      ? {
          supply: howTo.supply.map((s) => ({
            "@type": "HowToSupply",
            name: s,
          })),
        }
      : {}),
    ...(howTo.tool
      ? {
          tool: howTo.tool.map((t) => ({
            "@type": "HowToTool",
            name: t,
          })),
        }
      : {}),
    step: howTo.steps.map((step) => ({
      "@type": "HowToStep",
      position: step.position,
      name: step.name,
      text: step.text,
      ...(step.url ? { url: step.url } : {}),
      ...(step.image
        ? { image: { "@type": "ImageObject", url: step.image } }
        : {}),
    })),
  };
}

// =============================================================================
// LOCAL BUSINESS SCHEMA
// =============================================================================

/**
 * Generate LocalBusiness structured data for city pages.
 *
 * Used by programmatic SEO city pages (/whatsapp-store/[city])
 * to earn local search visibility.
 *
 * IMPORTANT: Only use with real city data. Do not fabricate
 * phone numbers or addresses that don't exist.
 */
export function generateLocalBusinessSchema(city: {
  name: string;
  state: string;
  country?: string;
  merchantCount?: number;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `https://www.flowauxi.com/whatsapp-store/${city.name.toLowerCase().replace(/\s+/g, "-")}#localbusiness`,
    name: `Flowauxi WhatsApp Store — ${city.name}`,
    description: `Create your free WhatsApp online store in ${city.name}, ${city.state}. ${city.merchantCount ? `Trusted by ${city.merchantCount}+ businesses` : "Start selling on WhatsApp today"}.`,
    url: `https://www.flowauxi.com/whatsapp-store/${city.name.toLowerCase().replace(/\s+/g, "-")}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: city.name,
      addressRegion: city.state,
      addressCountry: city.country || "IN",
    },
    areaServed: {
      "@type": city.country === "IN" ? "State" : "Country",
      name: city.state,
    },
    parentOrganization: { "@id": "https://www.flowauxi.com/#organization" },
  };
}

// =============================================================================
// REVIEW SCHEMA (GATED BY ENABLE_REVIEWS)
// =============================================================================

/**
 * Generate Review structured data for testimonials.
 *
 * CRITICAL: This function returns null when ENABLE_REVIEWS is false.
 * Do NOT call this function with fabricated review data.
 * Only use with real, verifiable reviews from real customers.
 *
 * Returns null if reviews are not enabled — callers MUST handle null.
 */
export function generateReviewSchema(review: {
  author: string;
  ratingValue: number;
  reviewBody: string;
  datePublished: string;
  itemName: string;
}): Record<string, unknown> | null {
  if (!getReviewRating()) return null;

  return {
    "@context": "https://schema.org",
    "@type": "Review",
    author: { "@type": "Person", name: review.author },
    datePublished: review.datePublished,
    reviewBody: review.reviewBody,
    reviewRating: {
      "@type": "Rating",
      ratingValue: review.ratingValue,
      bestRating: 5,
    },
    itemReviewed: {
      "@type": "SoftwareApplication",
      name: review.itemName,
    },
  };
}

// =============================================================================
// PRICING SCHEMA
// =============================================================================

/**
 * Generate SoftwareApplication + single Offer schema.
 * Use on pages showing one specific plan (e.g. free plan landing page).
 *
 * Google only renders ONE price per SoftwareApplication rich result.
 * For price ranges, use generatePricingRangeSchema instead.
 */
export function generatePricingSchema(plan: {
  name: string;
  price: number;
  currency: string;
  description: string;
  priceValidUntil?: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Flowauxi",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "Offer",
      name: plan.name,
      price: plan.price.toFixed(2),
      priceCurrency: plan.currency,
      description: plan.description,
      availability: "https://schema.org/InStock",
      ...(plan.priceValidUntil
        ? { priceValidUntil: plan.priceValidUntil }
        : {}),
    },
  };
}

/**
 * Generate SoftwareApplication + AggregateOffer schema for price ranges.
 * Use on pages showing multiple plans (e.g. pricing page, comparison pages).
 *
 * Google renders "Starting at ₹0" in search results when lowPrice is 0.
 * This is the correct schema for the pricing page and money keyword landing pages.
 */
export function generatePricingRangeSchema(
  plans: Array<{
    name: string;
    price: number;
    currency: string;
  }>,
): Record<string, unknown> {
  const prices = plans.map((p) => p.price);
  const lowPrice = Math.min(...prices);
  const highPrice = Math.max(...prices);

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Flowauxi",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any",
    offers: {
      "@type": "AggregateOffer",
      lowPrice: lowPrice.toFixed(2),
      highPrice: highPrice.toFixed(2),
      priceCurrency: plans[0]?.currency || "INR",
      offerCount: plans.length,
      offers: plans.map((plan) => ({
        "@type": "Offer",
        name: plan.name,
        price: plan.price.toFixed(2),
        priceCurrency: plan.currency,
        availability: "https://schema.org/InStock",
      })),
    },
  };
}