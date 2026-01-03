"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Header from "./Header/Header";
import HeroSection from "./HeroSection";

// Lazy load components that use GSAP to improve initial load
const TrustedBy = dynamic(() => import("./TrustedBy"), { ssr: false });
const WhatsAppFeatures = dynamic(
  () => import("./WhatsAppFeatures/WhatsAppFeatures"),
  { ssr: false }
);

// Lazy load below-fold components for better performance
const PricingCards = dynamic(() => import("./PricingCards/PricingCards"), {
  ssr: false,
});
const Testimonials = dynamic(() => import("./Testimonials"), { ssr: false });
const ContactSection = dynamic(
  () => import("./ContactSection/ContactSection"),
  { ssr: false }
);
const Footer = dynamic(() => import("./Footer/Footer"), { ssr: false });

export default function HomePageContent() {
  const [showBelowFold, setShowBelowFold] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Use Intersection Observer to load below-fold content when user scrolls near
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShowBelowFold(true);
          observer.disconnect(); // Only need to trigger once
        }
      },
      { rootMargin: "200px" } // Start loading 200px before visible
    );

    if (triggerRef.current) {
      observer.observe(triggerRef.current);
    }

    // Also trigger after 3 seconds as fallback for slow scrollers
    const timeout = setTimeout(() => setShowBelowFold(true), 3000);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="min-h-screen">
      {/* Header / Navigation */}
      <Header />

      {/* Hero Section */}
      <div className="pt-16 md:pt-20">
        <HeroSection />
      </div>

      {/* Trust Section */}
      <TrustedBy />

      {/* WhatsApp Features Section */}
      <WhatsAppFeatures />

      {/* Trigger point for below-fold content */}
      <div ref={triggerRef} />

      {/* Lazy-loaded below-fold sections - only render when needed */}
      {showBelowFold && (
        <>
          <PricingCards />
          <Testimonials />
          <ContactSection />
          <Footer />
        </>
      )}
    </div>
  );
}
