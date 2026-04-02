"use client";

import { motion } from "framer-motion";
import { Check, ArrowRight, Zap } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useAuthRedirect } from "@/app/hooks/useAuthRedirect";
import type { PricingTier } from "@/lib/product/types";

// ============================================================================
// GENERIC PRICING CARDS (used by domains without a custom pricing section)
// ============================================================================

interface GenericPricingProps {
  plans: Array<{
    name: string;
    price: number;
    priceDisplay: string;
    description: string;
    tagline?: string;
    popular?: boolean;
    features: string[];
  }>;
  productName: string;
  subtitle: string;
  bgColor?: string;
}

export default function GenericPricingSection({
  plans,
  productName,
  subtitle,
  bgColor = "#F1F3F4",
}: GenericPricingProps) {
  const { handleLoginClick, handleGetStartedClick, isLoading } =
    useAuthRedirect();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div
      className="min-h-screen font-sans text-gray-900 overflow-x-hidden flex flex-col relative w-full selection:bg-black selection:text-white"
      style={{ backgroundColor: bgColor }}
    >
      {/* Simple Navbar */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full relative z-50 pt-6 pb-4"
      >
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Link href="/" className="flex items-center gap-2">
                <Image
                  src="/logo.png"
                  alt="Flowauxi Logo"
                  width={32}
                  height={32}
                  className="object-contain"
                />
                <span className="text-xl font-bold tracking-tight text-[#111111]">
                  Flowauxi
                </span>
              </Link>
            </div>

            {/* Desktop CTA */}
            <div className="hidden md:flex items-center gap-4">
              <a
                href="/login"
                onClick={handleLoginClick}
                className="px-8 py-3.5 border border-black rounded-full text-[15px] font-bold text-gray-800 hover:bg-gray-50 transition-all"
                style={{ opacity: isLoading ? 0.7 : 1 }}
              >
                {isLoading ? "..." : "Login"}
              </a>
              <a
                href="/signup"
                onClick={handleGetStartedClick}
                className="bg-black text-white px-8 py-3.5 border border-black rounded-full text-[16px] font-black hover:bg-white hover:text-black transition-all shadow-lg shadow-black/10"
                style={{ opacity: isLoading ? 0.7 : 1 }}
              >
                {isLoading ? "..." : "Get Started"}
              </a>
            </div>

            {/* Mobile Menu Toggle */}
            <div className="md:hidden flex items-center">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-gray-900 p-2 focus:outline-none"
              >
                {isMobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-full left-0 w-full bg-white shadow-xl z-50 md:hidden flex flex-col items-center py-6 gap-4 border-t border-gray-100"
          >
            <a
              href="/login"
              onClick={handleLoginClick}
              className="w-[80%] py-4 border border-black rounded-full text-[16px] font-bold text-center text-gray-800"
            >
              Login
            </a>
            <a
              href="/signup"
              onClick={handleGetStartedClick}
              className="w-[80%] py-4 bg-black text-white border border-black rounded-full text-[16px] font-black text-center"
            >
              Get Started
            </a>
          </motion.div>
        )}
      </motion.nav>

      {/* Main Content */}
      <main className="flex-1 pt-12">
        {/* Header */}
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 pt-12 pb-8 text-center">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[48px] md:text-[64px] lg:text-[72px] font-serif font-black text-[#111111] leading-tight mb-4"
          >
            Pricing <span className="text-gray-400">Plans</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-gray-600 font-medium max-w-2xl mx-auto"
          >
            {subtitle}
          </motion.p>
        </div>

        {/* Pricing Cards */}
        <section className="py-12 pb-24 relative overflow-hidden">
          <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16">
            <div
              className={`grid grid-cols-1 md:grid-cols-2 ${plans.length >= 3 ? "lg:grid-cols-3" : ""} gap-8`}
            >
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
                        {plan.priceDisplay}
                      </span>
                      <span className="text-lg font-bold text-gray-500">
                        /mo
                      </span>
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
                    Get Started
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Simple Footer */}
      <footer className="py-12 border-t border-gray-200">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Image
              src="/logo.png"
              alt="Flowauxi Logo"
              width={24}
              height={24}
              className="object-contain"
            />
            <span className="text-lg font-bold tracking-tight text-[#111111]">
              Flowauxi
            </span>
          </div>
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Flowauxi. All rights reserved.
          </p>
          <div className="flex items-center justify-center gap-6 mt-4 text-sm text-gray-500">
            <Link href="/privacy" className="hover:text-black transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-black transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
