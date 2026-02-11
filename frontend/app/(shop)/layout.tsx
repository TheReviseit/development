import type { Metadata } from "next";

/**
 * Shop Landing Page Metadata
 */
export const shopMetadata: Metadata = {
  metadataBase: new URL("https://shop.flowauxi.com"),
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
  openGraph: {
    title: "Commerce Platform for Modern Businesses",
    description:
      "Enterprise-grade commerce platform with AI-powered automation",
    type: "website",
    url: "https://shop.flowauxi.com",
    siteName: "Flowauxi Shop",
  },
  twitter: {
    card: "summary_large_image",
    title: "Commerce Platform for Modern Businesses",
    description:
      "Enterprise-grade commerce platform with AI-powered automation",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

export const metadata = shopMetadata;
