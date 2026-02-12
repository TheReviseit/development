import { headers } from "next/headers";
import ShopNavbar from "../shop/components/ShopNavbar";
import ShopPricingSection from "../shop/components/ShopPricingSection";
import ShopFooter from "../shop/components/ShopFooter";

/**
 * Root Pricing Page
 * Detects domain/port and renders the appropriate pricing content
 */
async function getProductFromRequest() {
  const headersList = await headers();
  const host = headersList.get("host") || "";

  // Check port in development
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    if (host.includes(":3001")) return "shop";
    if (host.includes(":3002")) return "marketing";
    if (host.includes(":3003")) return "showcase";
  }

  // Check subdomain in production
  if (host.startsWith("shop.")) return "shop";
  if (host.startsWith("marketing.")) return "marketing";
  if (host.startsWith("showcase.")) return "showcase";

  // Default: dashboard
  return "dashboard";
}

export default async function PricingPage() {
  const product = await getProductFromRequest();

  // Render product-specific pricing
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

  // Fallback for other domains
  return (
    <div
      style={{
        padding: "100px 24px",
        textAlign: "center",
        fontFamily: "sans-serif",
      }}
    >
      <h1>Pricing</h1>
      <p>Pricing information for {product} is coming soon.</p>
    </div>
  );
}
