import type { Metadata } from "next";
import { headers } from "next/headers";

/**
 * Shop Landing Page Layout — Multi-Domain SEO
 *
 * CRITICAL FIX: metadataBase is now dynamic (reads from host header)
 * instead of hardcoded to "https://shop.flowauxi.com".
 * This ensures canonical URLs and OG tags work correctly on
 * any domain (custom domains, subdomains, localhost).
 */

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") || "shop.flowauxi.com";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");
  const protocol = isLocalhost ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  return {
    metadataBase: new URL(baseUrl),
    title: "Commerce Platform for Modern Businesses | Flowauxi Shop",
    description:
      "Enterprise-grade commerce platform with AI-powered automation, WhatsApp integration, and real-time analytics. Built for scale.",
    keywords: [
      "ecommerce platform",
      "commerce automation",
      "WhatsApp commerce",
      "AI commerce",
      "enterprise ecommerce",
      "online store builder",
      "commerce infrastructure",
    ],
    authors: [{ name: "Flowauxi" }],
    alternates: {
      canonical: baseUrl,
    },
    openGraph: {
      title: "Commerce Platform for Modern Businesses",
      description:
        "Enterprise-grade commerce platform with AI-powered automation",
      type: "website",
      url: baseUrl,
      siteName: "Flowauxi Shop",
      images: [
        {
          url: `${baseUrl}/og-image.png`,
          width: 1200,
          height: 630,
          alt: "Flowauxi Shop — Commerce Platform",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Commerce Platform for Modern Businesses",
      description:
        "Enterprise-grade commerce platform with AI-powered automation",
      images: [`${baseUrl}/og-image.png`],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
