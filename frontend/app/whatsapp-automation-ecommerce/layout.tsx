import type { Metadata } from "next";

/**
 * WhatsApp Automation for E-commerce — SEO Landing Page Layout
 *
 * This is the PRIMARY RANKING PAGE for "WhatsApp automation for e-commerce".
 * It lives on the main domain (www.flowauxi.com) for maximum authority.
 *
 * IMPORTANT: Do NOT inject schemas here — the root layout.tsx
 * handles domain-aware schema injection via the schema firewall.
 */

export const metadata: Metadata = {
  title:
    "WhatsApp Automation for E-commerce | AI Chatbot, CRM & Store Builder",
  description:
    "Automate your e-commerce business with Flowauxi's WhatsApp automation platform. Use AI chatbots to capture orders, manage customers, send invoices, and scale sales—all in one dashboard.",
  keywords: [
    "WhatsApp automation for e-commerce",
    "WhatsApp chatbot for business",
    "WhatsApp order automation",
    "WhatsApp CRM",
    "WhatsApp marketing automation",
    "AI chatbot for e-commerce",
    "automate customer support WhatsApp",
    "how to automate WhatsApp orders for online store",
    "best WhatsApp automation tool for small business",
    "WhatsApp chatbot for Shopify alternative",
    "WhatsApp automation India",
    "conversational commerce",
    "D2C WhatsApp automation",
    "WhatsApp store automation",
    "automated order booking WhatsApp",
  ],
  openGraph: {
    title:
      "WhatsApp Automation for E-commerce | AI Chatbot, CRM & Store Builder | Flowauxi",
    description:
      "Automate your e-commerce with WhatsApp. AI chatbots for orders, CRM for customers, invoicing & analytics. Start free.",
    url: "https://www.flowauxi.com/whatsapp-automation-ecommerce",
    type: "website",
    images: [
      {
        url: "https://www.flowauxi.com/og-image.png",
        width: 1200,
        height: 630,
        alt: "WhatsApp Automation for E-commerce — Flowauxi",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WhatsApp Automation for E-commerce | Flowauxi",
    description:
      "Automate your e-commerce with WhatsApp. AI chatbots, CRM, invoicing & analytics.",
  },
  alternates: {
    canonical: "https://www.flowauxi.com/whatsapp-automation-ecommerce",
  },
};

export default function WhatsAppEcommerceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
