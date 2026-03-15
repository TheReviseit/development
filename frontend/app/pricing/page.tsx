import { headers } from "next/headers";
import ShopNavbar from "../shop/components/ShopNavbar";
import ShopPricingSection from "../shop/components/ShopPricingSection";
import ShopFooter from "../shop/components/ShopFooter";
import Header from "../components/Header/Header";
import Footer from "../components/Footer/Footer";
import PricingCards from "../components/PricingCards/PricingCards";
import type { ProductDomain } from "../../lib/domain/config";

/**
 * Root Pricing Page
 * Detects domain/port and renders the appropriate pricing content
 */
async function getProductFromRequest(): Promise<ProductDomain> {
  const headersList = await headers();
  const host = headersList.get("host") || "";

  // Check port in development
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    if (host.includes(":3001")) return "shop";
    if (host.includes(":3002")) return "showcase";
    if (host.includes(":3003")) return "marketing";
  }

  // Check subdomain in production
  if (host.startsWith("shop.")) return "shop";
  if (host.startsWith("marketing.")) return "marketing";
  if (host.startsWith("showcase.")) return "showcase";
  if (host.startsWith("api.")) return "api";

  // Default: dashboard
  return "dashboard";
}

export default async function PricingPage() {
  const product = await getProductFromRequest();

  // Render product-specific pricing for Shop
  if (product === "shop") {
    return (
      <>
        <ShopNavbar />
        <main>
          <ShopPricingSection />
        </main>
        <ShopFooter />
      </>
    );
  }

  // Common Layout for other domains (Dashboard, Marketing, Showcase, API)
  return (
    <>
      <Header />
      <main className="pt-32 pb-24">
        <PricingCards domain={product} />
      </main>
      <Footer />
    </>
  );
}
