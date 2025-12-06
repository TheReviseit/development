"use client";

import Image from "next/image";
import Header from "./components/Header/Header";
import HeroSection from "./components/HeroSection";
import TrustedBy from "./components/TrustedBy";
import WhatsAppFeatures from "./components/WhatsAppFeatures/WhatsAppFeatures";
import Testimonials from "./components/Testimonials";
import ContactSection from "./components/ContactSection/ContactSection";
import Footer from "./components/Footer/Footer";

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* ============================================
          1. Header / Navigation
          ============================================ */}
      <Header />

      {/* ============================================
          2. Hero Section
          ============================================ */}
      <HeroSection />

      {/* ============================================
          3. Trust Section
          ============================================ */}
      <TrustedBy />

      {/* ============================================
          4. WhatsApp Features Section
          ============================================ */}
      <WhatsAppFeatures />

      {/* ============================================
          5. OLD Features Grid Section (HIDDEN)
          ============================================ */}
      <section
        id="features-old"
        className="section"
        style={{ display: "none" }}
      >
        <div className="container">
          {/* Section Header */}
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="mb-4">Everything you need for WhatsApp at scale</h2>
            <p className="body-l text-[#4B5563]">
              Powerful features designed to automate, engage, and grow your
              business through WhatsApp.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1: AI Replies */}
            <div className="glass-card p-6 hover:shadow-xl smooth-transition">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#22C15A]/20 to-[#2DD4FF]/20 flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-[#22C15A]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
              </div>
              <h3 className="mb-3">AI Replies</h3>
              <p className="body-s text-[#4B5563]">
                Intelligent auto-responses trained on your FAQs and conversation
                history for natural interactions.
              </p>
            </div>

            {/* Feature 2: Smart Broadcasting */}
            <div className="glass-card p-6 hover:shadow-xl smooth-transition">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#22C15A]/20 to-[#2DD4FF]/20 flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-[#22C15A]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"
                  />
                </svg>
              </div>
              <h3 className="mb-3">Smart Broadcasting</h3>
              <p className="body-s text-[#4B5563]">
                Segment audiences, schedule campaigns, and ensure high
                deliverability with intelligent targeting.
              </p>
            </div>

            {/* Feature 3: CRM Integration */}
            <div className="glass-card p-6 hover:shadow-xl smooth-transition">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#22C15A]/20 to-[#2DD4FF]/20 flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-[#22C15A]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 14v6m-3-3h6M6 10h2a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2zm10 0h2a2 2 0 002-2V6a2 2 0 00-2-2h-2a2 2 0 00-2 2v2a2 2 0 002 2zM6 20h2a2 2 0 002-2v-2a2 2 0 00-2-2H6a2 2 0 00-2 2v2a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h3 className="mb-3">CRM Integration</h3>
              <p className="body-s text-[#4B5563]">
                Sync contacts, tags, and conversations seamlessly with your
                existing CRM system.
              </p>
            </div>

            {/* Feature 4: Chat Flows */}
            <div className="glass-card p-6 hover:shadow-xl smooth-transition">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#22C15A]/20 to-[#2DD4FF]/20 flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-[#22C15A]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
              </div>
              <h3 className="mb-3">Chat Flows</h3>
              <p className="body-s text-[#4B5563]">
                Visual drag-and-drop flows for onboarding, support, and sales
                automation.
              </p>
            </div>

            {/* Feature 5: Analytics Dashboard */}
            <div className="glass-card p-6 hover:shadow-xl smooth-transition">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#22C15A]/20 to-[#2DD4FF]/20 flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-[#22C15A]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0-6V5a2 2 0 012-2h2a2 2 0 012 2v6a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h3 className="mb-3">Analytics Dashboard</h3>
              <p className="body-s text-[#4B5563]">
                Track open rates, response times, and agent performance with
                real-time insights.
              </p>
            </div>

            {/* Feature 6: WhatsApp Cloud API */}
            <div className="glass-card p-6 hover:shadow-xl smooth-transition">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#22C15A]/20 to-[#2DD4FF]/20 flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-[#22C15A]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                  />
                </svg>
              </div>
              <h3 className="mb-3">WhatsApp Cloud API</h3>
              <p className="body-s text-[#4B5563]">
                Built on official WhatsApp Cloud API for maximum reliability and
                scale.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================
          6. Testimonials Section
          ============================================ */}
      <Testimonials />

      {/* ============================================
          7. Contact Section
          ============================================ */}
      <ContactSection />

      {/* ============================================
          8. Footer
          ============================================ */}
      <Footer />
    </div>
  );
}
