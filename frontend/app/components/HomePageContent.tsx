"use client";

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

      {/* Lazy-loaded below-fold sections */}
      <PricingCards />
      <Testimonials />
      <ContactSection />
      <Footer />
    </div>
  );
}
