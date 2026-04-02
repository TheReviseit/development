"use client";

import GenericPricingSection from "./GenericPricingSection";
import { PRODUCT_REGISTRY } from "@/lib/product/registry";

export default function DashboardPricingPage() {
  const product = PRODUCT_REGISTRY.dashboard;
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
      subtitle="Choose the perfect WhatsApp AI automation plan for your business. From solo entrepreneurs to large enterprises."
      bgColor="#F1F3F4"
    />
  );
}
