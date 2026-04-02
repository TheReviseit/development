import type { Metadata } from "next";

/**
 * Blog Layout — SEO for long-tail keyword targeting
 *
 * The blog system targets informational search queries that
 * feed into the main conversion funnel:
 * - "how to automate WhatsApp orders" → /whatsapp-automation-ecommerce → /signup
 * - "best WhatsApp chatbot for e-commerce" → shop.flowauxi.com → /signup
 */

export const metadata: Metadata = {
  title: {
    template: "%s | Flowauxi Blog",
    default:
      "Blog — WhatsApp Automation Tips, Guides & Best Practices | Flowauxi",
  },
  description:
    "Expert insights on WhatsApp automation for e-commerce, business messaging strategies, AI chatbot implementation, and customer engagement tips.",
  keywords: [
    "WhatsApp automation blog",
    "WhatsApp automation tips",
    "WhatsApp e-commerce guide",
    "WhatsApp chatbot tutorial",
    "business messaging tips",
    "customer engagement guides",
    "how to automate WhatsApp",
    "WhatsApp business API guide",
  ],
  openGraph: {
    type: "website",
    siteName: "Flowauxi Blog",
    locale: "en_IN",
  },
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
