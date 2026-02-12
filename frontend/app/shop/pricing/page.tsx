/**
 * Shop Pricing Page
 * Domain: shop.flowauxi.com/pricing
 */

import ShopNavbar from "../components/ShopNavbar";
import ShopPricingSection from "../components/ShopPricingSection";
import ShopFooter from "../components/ShopFooter";

export const metadata = {
  title: "Pricing | Flowauxi Shop",
  description:
    "Flexible plans built for modern commerce operations. Choose the perfect plan for your business scale.",
};

export default function ShopPricingPage() {
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
