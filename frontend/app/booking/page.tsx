"use client";

import { motion } from "framer-motion";
import BookingNavbar from "./components/BookingNavbar";
import BookingHero from "./components/BookingHero";
import BookingFeatures from "./components/BookingFeatures";
import BookingHowItWorks from "./components/BookingHowItWorks";

import BookingCTA from "./components/BookingCTA";
import BookingFooter from "./components/BookingFooter";
import ContactSection from "@/app/components/ContactSection/ContactSection";

/**
 * FAANG-Level Booking Landing Page
 *
 * This page is a composition of modular components for better maintainability
 * and "World Class" performance. Each section uses Framer Motion for premium
 * reveal-on-scroll animations.
 */
export default function BookingLandingPage() {
  return (
    <div className="min-h-screen bg-[#F1F3F4] font-sans text-gray-900 flex flex-col relative w-full selection:bg-black selection:text-white overflow-x-clip">
      {/* Global Navigation */}
      <BookingNavbar />

      {/* Main Content Sections */}
      <div className="flex flex-col">
        {/* 1. Hero Section — The "Wow" factor */}
        <BookingHero />

        {/* 2. Core Value Props — The "Why" */}
        <BookingFeatures />

        {/* 3. Operational Logic — The "How" */}
        <BookingHowItWorks />



        {/* 5. Final Push — The "Conversion" */}
        <BookingCTA />

        {/* 6. Support & Inquiry — The "Connection" */}
        <div id="contact" className="booking-contact-theme">
          <ContactSection />
        </div>
      </div>

      {/* Footer — The "Authority" */}
      <BookingFooter />
    </div>
  );
}
