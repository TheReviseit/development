import { headers } from "next/headers";
import type { Metadata } from "next";
import HomePageContent from "./components/HomePageContent";
import ShopLandingPage from "./shop/page";
import {
  resolveProductDomain,
  generateDomainMetadata,
  generateDomainFaqSchema,
} from "@/lib/seo/domain-seo";

/**
 * Dynamic Root Page — Domain-Aware SEO
 *
 * This is the entry point for ALL product domains:
 *   shop.flowauxi.com   → ShopLandingPage    + Shop SEO
 *   marketing.flowauxi.com → MarketingLanding + Marketing SEO
 *   pages.flowauxi.com  → ShowcaseLanding    + Showcase SEO
 *   www.flowauxi.com    → HomePageContent    + Dashboard SEO
 *
 * generateMetadata() produces UNIQUE title/description/OG/canonical
 * per domain — this is what makes each subdomain rank independently.
 *
 * SCHEMA ARCHITECTURE:
 *   layout.tsx → structural schemas (Organization, WebSite, WebPage, BreadcrumbList, etc.)
 *   page.tsx   → FAQPage schema (one per URL, prevents Google duplication errors)
 */

// =============================================================================
// DYNAMIC METADATA — Different SEO per subdomain
// =============================================================================

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") || "www.flowauxi.com";

  return generateDomainMetadata(host);
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default async function Home() {
  const headersList = await headers();
  const host = headersList.get("host") || "";
  const domain = resolveProductDomain(host);

  // Generate domain-specific FAQ schema (ONE per URL — Google requirement)
  const faqSchema = generateDomainFaqSchema(host);

  return (
    <>
      {/* Domain-specific FAQ structured data — exactly ONE FAQPage per URL */}
      {faqSchema && (
        <script
          key="page-faq-schema"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}

      {/* Domain-specific landing page */}
      {domain === "shop" && <ShopLandingPage />}
      {domain === "marketing" && <MarketingRedirect />}
      {domain === "showcase" && <ShowcaseRedirect />}
      {domain === "dashboard" && <HomePageContent />}
    </>
  );
}

/**
 * Marketing domain at root — renders the marketing page directly.
 * The actual marketing page is at /marketing, middleware rewrites "/" to it.
 */
async function MarketingRedirect() {
  const { default: MarketingLandingPage } = await import("./marketing/page");
  return <MarketingLandingPage />;
}

/**
 * Showcase domain at root — renders the showcase page directly.
 */
async function ShowcaseRedirect() {
  const { default: ShowcaseLandingPage } = await import("./showcase/page");
  return <ShowcaseLandingPage />;
}
