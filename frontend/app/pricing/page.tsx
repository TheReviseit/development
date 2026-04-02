/**
 * Universal Pricing Page (Domain-Aware)
 * ======================================
 * This page detects the current domain (shop, booking, marketing, etc.)
 * from the server headers and renders the correct domain-specific
 * pricing component with the correct navbar/footer.
 *
 * Previously this was hardcoded to show BookingPricing for ALL domains.
 */

import { getCurrentProduct } from "@/lib/product/server";
import type { ProductDomain } from "@/lib/product/types";

// Domain-specific pricing page wrappers
import BookingPricingPage from "./BookingPricingPage";
import ShopPricingPage from "./ShopPricingPage";
import DashboardPricingPage from "./DashboardPricingPage";
import MarketingPricingPage from "./MarketingPricingPage";
import ShowcasePricingPage from "./ShowcasePricingPage";
import ApiPricingPage from "./ApiPricingPage";

export async function generateMetadata() {
  const product = await getCurrentProduct();

  const titles: Record<ProductDomain, string> = {
    booking: "Pricing Plans | Flowauxi Booking",
    shop: "Pricing | Flowauxi Shop",
    dashboard: "Pricing Plans | Flowauxi",
    marketing: "Pricing Plans | Flowauxi Marketing",
    showcase: "Pricing Plans | Flowauxi Showcase",
    api: "Pricing Plans | Flowauxi API",
  };

  const descriptions: Record<ProductDomain, string> = {
    booking:
      "Choose the perfect booking plan for your business. From solo freelancers to large enterprises.",
    shop: "Flexible plans built for modern commerce operations. Choose the perfect plan for your business scale.",
    dashboard:
      "Choose the perfect WhatsApp AI automation plan for your business.",
    marketing:
      "Scale your WhatsApp marketing campaigns with the right plan.",
    showcase:
      "Showcase your portfolio with the perfect plan for your needs.",
    api: "Developer-friendly API plans for every scale.",
  };

  return {
    title: titles[product.id] || titles.dashboard,
    description: descriptions[product.id] || descriptions.dashboard,
  };
}

export default async function PricingPage() {
  const product = await getCurrentProduct();

  switch (product.id) {
    case "booking":
      return <BookingPricingPage />;
    case "shop":
      return <ShopPricingPage />;
    case "marketing":
      return <MarketingPricingPage />;
    case "showcase":
      return <ShowcasePricingPage />;
    case "api":
      return <ApiPricingPage />;
    case "dashboard":
    default:
      return <DashboardPricingPage />;
  }
}
