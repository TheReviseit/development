"use client";

import GenericPricingSection from "./GenericPricingSection";
import { PRODUCT_REGISTRY } from "@/lib/product/registry";

export default function MarketingPricingPage() {
  const product = PRODUCT_REGISTRY.marketing;
  const plans = product.pricing.map((plan) => ({
    name: plan.name,
    price: plan.price,
    priceDisplay: plan.priceDisplay,
    description: plan.description,
    tagline: plan.tagline,
    popular: plan.popular,
    features: plan.features,
  }));

  return (
    <GenericPricingSection
      plans={plans}
      productName={product.name}
      subtitle="Scale your WhatsApp marketing campaigns with the right plan. From small campaigns to enterprise-level outreach."
      bgColor="#FFFFFF"
    />
  );
}
