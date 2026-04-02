"use client";

import GenericPricingSection from "./GenericPricingSection";
import { PRODUCT_REGISTRY } from "@/lib/product/registry";

export default function ShowcasePricingPage() {
  const product = PRODUCT_REGISTRY.showcase;
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
      subtitle="Showcase your portfolio with the perfect plan. From freelancers to professional agencies."
      bgColor="#F1F3F4"
    />
  );
}
