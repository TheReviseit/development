"use client";

import GenericPricingSection from "./GenericPricingSection";
import { PRODUCT_REGISTRY } from "@/lib/product/registry";

export default function ApiPricingPage() {
  const product = PRODUCT_REGISTRY.api;
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
      subtitle="Developer-friendly API plans for every scale. Build powerful WhatsApp integrations."
      bgColor="#FFFFFF"
    />
  );
}
