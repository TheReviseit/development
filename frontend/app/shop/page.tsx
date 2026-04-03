/**
 * Shop Product Landing Page
 * Domain: shop.flowauxi.com
 *
 * Architecture: Thin orchestrator — all sections are separate components
 * with dedicated CSS Module files. No inline styles.
 */

import ShopNavbar from "./components/ShopNavbar";
import ShopHero from "./components/ShopHero";
import ShopBridgeSection from "./components/ShopBridgeSection";
import ShopFeatures from "./components/ShopFeatures";
import ShopShowcase from "./components/ShopShowcase";
import ShopSteps from "./components/ShopSteps";
import ShopTrust from "./components/ShopTrust";
import ShopCTA from "./components/ShopCTA";
import ShopGetInTouch from "./components/ShopGetInTouch";
import ShopFooter from "./components/ShopFooter";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title:
    "WhatsApp E-commerce Platform | Build Your Online Store & Automate Orders | Flowauxi Shop",
  description:
    "Build a WhatsApp-powered e-commerce store with automated order booking, AI chatbot for customer support, real-time inventory management & payment integration. The best WhatsApp store builder for small businesses in India. Start free — no coding required.",
  keywords: [
    "WhatsApp e-commerce platform",
    "sell on WhatsApp",
    "WhatsApp store builder",
    "WhatsApp order automation",
    "WhatsApp chatbot for online store",
    "automated order booking WhatsApp",
    "AI chatbot for e-commerce",
    "online store with WhatsApp integration",
    "WhatsApp CRM for e-commerce",
    "conversational commerce platform",
    "WhatsApp product catalog",
    "automate WhatsApp sales",
    "best WhatsApp store builder India",
    "D2C WhatsApp automation",
    "WhatsApp business store",
    "ecommerce WhatsApp chatbot",
    "sell online via WhatsApp",
    "WhatsApp order management",
  ],
  alternates: {
    canonical: "https://shop.flowauxi.com",
  },
  openGraph: {
    title:
      "WhatsApp E-commerce Platform | Build Your Online Store & Automate Orders | Flowauxi Shop",
    description:
      "Build a WhatsApp-powered e-commerce store with automated order booking, AI chatbot & payment integration. Start free — no coding required.",
    url: "https://shop.flowauxi.com",
    siteName: "Flowauxi Shop",
    images: [
      {
        url: "https://shop.flowauxi.com/og-shop.png",
        width: 1200,
        height: 630,
        alt: "Flowauxi Shop — WhatsApp-Powered E-commerce Store Builder with Automated Order Booking",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title:
      "WhatsApp E-commerce Platform | Build Your Online Store & Automate Orders | Flowauxi Shop",
    description:
      "Build a WhatsApp-powered e-commerce store with automated order booking, AI chatbot & payment integration.",
    images: ["https://shop.flowauxi.com/og-shop.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function ShopLandingPage() {
  return (
    <div className="mainLayoutWrapper">
      <ShopNavbar />
      <main>
        <ShopHero />
        <ShopBridgeSection />
        <ShopFeatures />
        <ShopShowcase />
        <ShopSteps />
        {/* <ShopTrust /> */}
        <ShopCTA />
        <ShopGetInTouch />
      </main>
      <ShopFooter />
    </div>
  );
}
