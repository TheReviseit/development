import type { Metadata } from "next";
import ShopNavbar from "@/app/shop/components/ShopNavbar";
import SEOHero from "@/app/shop/components/SEOHero";
import ShopBridgeSection from "@/app/shop/components/ShopBridgeSection";
import ShopFeatures from "@/app/shop/components/ShopFeatures";
import ShopShowcase from "@/app/shop/components/ShopShowcase";
import ShopSteps from "@/app/shop/components/ShopSteps";
import ShopCTA from "@/app/shop/components/ShopCTA";
import ShopGetInTouch from "@/app/shop/components/ShopGetInTouch";
import ShopFooter from "@/app/shop/components/ShopFooter";
import { generateHowToSchema, generatePricingRangeSchema } from "@/lib/seo/schema-extensions";

export const revalidate = 86400; // 24 hours ISR

export const metadata: Metadata = {
  title: "Create Online Store Free — No Credit Card, No Trial Limits | Flowauxi",
  description:
    "Create your online store free with Flowauxi. Professional design, WhatsApp integration, AI chatbot, order automation. Free website forever. Start in 5 minutes.",
  alternates: {
    canonical: "https://shop.flowauxi.com/create-online-store-free",
  },
};

export default function CreateOnlineStoreFreePage() {
  const howToSchema = generateHowToSchema({
    name: "How to Create an Online Store for Free",
    description: "Follow these steps to create your free online store with Flowauxi.",
    steps: [
      { position: 1, name: "Create an Account", text: "Sign up for a free Flowauxi account. No credit card required.", url: "https://shop.flowauxi.com/signup" },
      { position: 2, name: "Add Products", text: "Upload your products, set prices, and organize your catalog." },
      { position: 3, name: "Start Selling", text: "Share your WhatsApp store link and start receiving automated orders.", url: "https://shop.flowauxi.com/features/whatsapp-store" }
    ]
  });

  const pricingSchema = generatePricingRangeSchema([
    { name: "Free Plan", price: 0, currency: "INR" },
    { name: "Premium Plan", price: 1999, currency: "INR" }
  ]);

  return (
    <div className="mainLayoutWrapper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingSchema) }}
      />
      <ShopNavbar />
      <main>
        <SEOHero
          headlinePre="Create Your Online Store Free"
          headlinePost="Start Selling"
          headlineHighlight="Today"
          subtitle="Create your online store free with Flowauxi. Professional design, WhatsApp integration, AI chatbot, order automation. Free website forever. Start in 5 minutes."
          heroImageAlt="Create an online store for free"
        />
        <ShopBridgeSection />
        <ShopFeatures />
        <ShopShowcase />
        <ShopSteps />
        <ShopCTA />
        <ShopGetInTouch />
      </main>
      <ShopFooter />
    </div>
  );
}
