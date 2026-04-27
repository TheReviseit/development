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
  title: "Free Website Builder — No Cost, No Code, No Catch | Flowauxi",
  description:
    "Create a free website with Flowauxi. Professional design, WhatsApp integration, AI chatbot included. No credit card required. 500+ businesses trust us.",
  alternates: {
    canonical: "https://shop.flowauxi.com/free-website-builder",
  },
};

export default function FreeWebsiteBuilderPage() {
  const howToSchema = generateHowToSchema({
    name: "How to Build a Free Website in 3 Steps",
    description: "Follow these steps to create your free website with Flowauxi.",
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
          headlinePre="Free Website Builder"
          headlinePost="Create your website at"
          headlineHighlight="Zero Cost"
          subtitle="Create a free website with Flowauxi. Professional design, WhatsApp integration, AI chatbot included. No credit card required. 500+ businesses trust us."
          heroImageAlt="Flowauxi free website builder interface"
          primaryCtaText="Create Free Website"
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
