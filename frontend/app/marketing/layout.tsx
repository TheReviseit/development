import { headers } from "next/headers";
import type { Metadata } from "next";
import {
  generateDomainMetadata,
  generateDomainSchemas,
} from "@/lib/seo/domain-seo";

/**
 * Marketing Route Layout — SEO for /marketing path
 *
 * When marketing.flowauxi.com is accessed, middleware rewrites "/" to "/marketing".
 * This layout gives /marketing its own unique SEO identity so Google
 * indexes it separately from shop.flowauxi.com and www.flowauxi.com.
 */

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") || "marketing.flowauxi.com";

  // If accessed directly (not via subdomain), still use marketing SEO
  return generateDomainMetadata(host, {
    title:
      "Flowauxi Marketing — AI-Powered Campaign Automation & Growth Platform",
    description:
      "Enterprise marketing automation with AI campaigns, multi-channel broadcasting, audience segmentation, and real-time analytics. WhatsApp, SMS, and email — all in one.",
  });
}

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const host = headersList.get("host") || "marketing.flowauxi.com";
  const schemas = generateDomainSchemas(host);

  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={`marketing-schema-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      {children}
    </>
  );
}
