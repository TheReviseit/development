import type { Metadata } from "next";
import { headers } from "next/headers";
import { generateDomainMetadata } from "@/lib/seo/domain-seo";

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") || "shop.flowauxi.com";
  return generateDomainMetadata(host);
}

export default function ShopRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Schemas are injected by root layout.tsx — DO NOT duplicate here
  return <>{children}</>;
}
