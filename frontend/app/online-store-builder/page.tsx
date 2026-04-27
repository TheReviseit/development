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
  title: "Online Store Builder — Create Your Store in Minutes | Flowauxi",
  description:
    "Build your online store in 10 minutes with Flowauxi. Free website + WhatsApp integration, AI chatbot, order automation. No coding. Start free today.",
  alternates: {
    canonical: "https://shop.flowauxi.com/online-store-builder",
  },
};

export default function OnlineStoreBuilderPage() {
  const howToSchema = generateHowToSchema({
    name: "How to Build an Online Store in 3 Steps",
    description: "Follow these steps to create your free online store with Flowauxi and start selling on WhatsApp.",
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
          headlinePre="Online Store Builder"
          headlinePost="Create your store in minutes"
          headlineHighlight="without coding"
          subtitle="Build your online store in 10 minutes with Flowauxi. Free website + WhatsApp integration, AI chatbot, order automation. No coding. Start free today."
          heroImageAlt="Flowauxi Online Store Builder dashboard"
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
