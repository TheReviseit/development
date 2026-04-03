"use client";

import ShopNavbar from "@/app/shop/components/ShopNavbar";
import ShopPricingSection from "@/app/shop/components/ShopPricingSection";
import ShopFooter from "@/app/shop/components/ShopFooter";

export default function ShopPricingPage() {
  return (
    <>
      <ShopNavbar isPricingPage={true} />
      <main>
        <ShopPricingSection />
      </main>
      <ShopFooter />
    </>
  );
}
