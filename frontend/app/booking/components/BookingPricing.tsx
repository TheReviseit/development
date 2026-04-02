"use client";

import { motion } from "framer-motion";
import { Check, ArrowRight, Zap } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Free",
    price: "$0",
    description: "Perfect to test Flowauxi and get your first bookings.",
    features: [
      "5 Bookings per month",
      "Basic Booking Page",
      "Manual Booking Management",
      "Email Support",
      "Flowauxi Branding",
    ],
    cta: "Start Free",
    popular: false,
  },
  {
    name: "Starter",
    price: "$19",
    description: "For individuals ready to automate and grow consistently.",
    features: [
      "20 Bookings per month",
      "20 Automated Reminders (Email + WhatsApp)",
      "20 Feedback Forms",
      "Google & Apple Calendar Sync",
      "Basic Analytics Dashboard",
      "Custom Booking Link",
    ],
    cta: "Start Now",
    popular: false,
  },
  {
    name: "Professional",
    price: "$39",
    description: "Built for serious businesses that want to scale revenue.",
    features: [
      "Unlimited Bookings",
      "Unlimited Reminders (Email + WhatsApp)",
      "Unlimited Feedback Forms",
      "Stripe Payment Integration",
      "Advanced Revenue Analytics",
      "Automated Feedback Collection",
      "Remove Flowauxi Branding",
      "Priority Support",
      "Everything in Starter",
    ],
    cta: "Upgrade to Pro",
    popular: true,
  },
];

export default function BookingPricing() {
  return (
    <section
      id="pricing"
      className="py-24 bg-gray-50/50 relative overflow-hidden"
    >
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-24">
          {plans.map((plan, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative p-10 rounded-[48px] border ${
                plan.popular ? "border-black border-2" : "border-gray-100"
              } flex flex-col bg-white shadow-[0_30px_60px_rgba(0,0,0,0.03)] hover:shadow-[0_30px_60px_rgba(0,0,0,0.08)] transition-all duration-500`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-black text-white px-6 py-1.5 rounded-full text-[12px] font-black tracking-widest flex items-center gap-2">
                  <Zap className="w-3 h-3 fill-current" />
                  MOST POPULAR
                </div>
              )}

              <div className="mb-10">
                <h3 className="text-2xl font-serif font-black mb-2 uppercase tracking-tight">
                  {plan.name}
                </h3>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-[54px] font-serif font-black leading-none">
                    {plan.price}
                  </span>
                  {plan.price !== "Custom" && (
                    <span className="text-lg font-bold text-gray-500">/mo</span>
                  )}
                </div>
                <p className="text-[15px] font-medium leading-relaxed text-gray-600 min-h-[45px]">
                  {plan.description}
                </p>
              </div>

              <div className="flex-1 space-y-4 mb-12">
                {plan.features.map((feature, fIndex) => (
                  <div key={fIndex} className="flex items-start gap-3">
                    <div className="mt-1 bg-black/5 p-0.5 rounded-full">
                      <Check className="w-4 h-4 shrink-0 text-black" />
                    </div>
                    <span className="text-[15px] font-medium leading-tight text-gray-800">
                      {feature}
                    </span>
                  </div>
                ))}
              </div>

              <Link
                href="/signup"
                className={`w-full py-5 rounded-[24px] text-[16px] font-black transition-all flex items-center justify-center gap-2 group ${
                  plan.popular
                    ? "bg-black text-white hover:bg-zinc-800 shadow-xl shadow-black/10"
                    : "bg-gray-100 text-black hover:bg-gray-200"
                }`}
              >
                {plan.cta}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
