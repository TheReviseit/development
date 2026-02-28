"use client";

import Header from "./Header/Header";
import HeroSection from "./HeroSection/HeroSection";
import TrustedBy from "./TrustedBy/TrustedBy";
import WhatsAppFeatures from "./WhatsAppFeatures/WhatsAppFeatures";
import Testimonials from "./Testimonials/Testimonials";
import ContactSection from "./ContactSection/ContactSection";
import Footer from "./Footer/Footer";

export default function HomePageContent() {
  return (
    <div className="min-h-screen">
      {/* Header / Navigation */}
      <Header />

      {/* Hero Section */}
      <div>
        <HeroSection />
      </div>

      {/* Trust Section */}
      <TrustedBy />

      {/* WhatsApp Features Section */}
      <WhatsAppFeatures />

      {/* Testimonials */}
      <Testimonials />

      {/* Contact Section */}
      <ContactSection />

      {/* Footer */}
      <Footer />
    </div>
  );
}
