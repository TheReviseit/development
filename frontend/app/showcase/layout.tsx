import type { Metadata } from "next";
import { headers } from "next/headers";
import { generateDomainMetadata } from "@/lib/seo/domain-seo";

/**
 * Showcase Route Layout — SEO for /showcase path
 *
 * When pages.flowauxi.com is accessed, middleware rewrites "/" to "/showcase".
 * This layout provides domain-specific metadata.
 *
 * IMPORTANT: Do NOT inject schemas here — the root layout.tsx
 * already handles domain-aware schema injection via the schema firewall.
 * Injecting here would cause DUPLICATE schemas that Google penalizes.
 */

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") || "pages.flowauxi.com";
  return generateDomainMetadata(host);
}

export default function ShowcaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Schemas are injected by root layout.tsx — DO NOT duplicate here
  return <>{children}</>;
}
