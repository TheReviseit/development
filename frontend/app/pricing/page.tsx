"use client";

import BookingNavbar from "@/app/booking/components/BookingNavbar";
import BookingFooter from "@/app/booking/components/BookingFooter";
import BookingPricing from "@/app/booking/components/BookingPricing";

import { motion } from "framer-motion";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#F1F3F4] font-sans text-gray-900 overflow-x-hidden flex flex-col relative w-full selection:bg-black selection:text-white">
      {/* Navigation */}
      <BookingNavbar />

      <main className="flex-1 pt-24">
        {/* Simple Page Header */}
        <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 pt-12 pb-8 text-center">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[56px] md:text-[72px] font-serif font-black text-[#111111] leading-tight mb-4"
          >
            Pricing <span className="text-gray-400">Plans</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl text-gray-600 font-medium max-w-2xl mx-auto"
          >
            Choose the perfect plan for your business. From solo freelancers to large enterprises, we've got you covered.
          </motion.p>
        </div>

        {/* The Pricing Component */}
        <BookingPricing />


      </main>

      {/* Footer */}
      <BookingFooter />
    </div>
  );
}
