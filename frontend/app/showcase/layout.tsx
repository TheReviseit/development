import { headers } from "next/headers";
import type { Metadata } from "next";
import {
  generateDomainMetadata,
  generateDomainSchemas,
} from "@/lib/seo/domain-seo";

/**
 * Showcase Route Layout — SEO for /showcase path
 *
 * When pages.flowauxi.com is accessed, middleware rewrites "/" to "/showcase".
 * This layout gives /showcase its own unique SEO identity for Google
 * so it ranks for "portfolio builder", "showcase website", etc.
 */

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") || "pages.flowauxi.com";

  return generateDomainMetadata(host, {
    title: "Flowauxi Pages — Professional Portfolio & Showcase Website Builder",
    description:
      "Build stunning portfolios and showcase websites. 50+ premium templates, drag-and-drop builder, custom domains, and AI content tools. For creators, freelancers, and agencies.",
  });
}

export default async function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const host = headersList.get("host") || "pages.flowauxi.com";
  const schemas = generateDomainSchemas(host);

  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={`showcase-schema-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      {children}
    </>
  );
}
