import { headers } from "next/headers";
import type { Metadata } from "next";
import {
  generateDomainMetadata,
  generateDomainSchemas,
} from "@/lib/seo/domain-seo";

/**
 * Shop Route Layout — SEO for /shop path
 *
 * When shop.flowauxi.com is accessed, middleware rewrites "/" to "/shop".
 * This layout ensures /shop has proper SEO metadata and structured data.
 */

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") || "shop.flowauxi.com";
  return generateDomainMetadata(host);
}

export default async function ShopRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const host = headersList.get("host") || "shop.flowauxi.com";
  const schemas = generateDomainSchemas(host);

  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={`shop-schema-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      {children}
    </>
  );
}
