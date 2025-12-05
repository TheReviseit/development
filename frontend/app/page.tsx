"use client";

import Image from "next/image";
import Header from "./components/Header/Header";
import HeroSection from "./components/HeroSection";
import TrustedBy from "./components/TrustedBy";
import WhatsAppFeatures from "./components/WhatsAppFeatures/WhatsAppFeatures";
import Testimonials from "./components/Testimonials";

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
          7. Footer
          ============================================ */}
      <footer id="footer" className="bg-[#111111] text-white py-16">
        <div className="container">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            {/* Company Info */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Image
                  src="/logo.png"
                  alt="ReviseIt Logo"
                  width={40}
                  height={40}
                  className="w-10 h-10 object-contain"
                />
                <span className="text-xl font-semibold">ReviseIt</span>
              </div>
              <p className="body-s text-gray-400">
                AI-powered WhatsApp automation for modern businesses.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-3 body-s">
                <li>
                  <a
                    href="#features"
                    className="text-gray-400 hover:text-[#22C15A] smooth-transition"
                  >
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#pricing"
                    className="text-gray-400 hover:text-[#22C15A] smooth-transition"
                  >
                    Pricing
                  </a>
                </li>
                <li>
                  <a
                    href="#integrations"
                    className="text-gray-400 hover:text-[#22C15A] smooth-transition"
                  >
                    Integrations
                  </a>
                </li>
                <li>
                  <a
                    href="#api"
                    className="text-gray-400 hover:text-[#22C15A] smooth-transition"
                  >
                    API Docs
                  </a>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-3 body-s">
                <li>
                  <a
                    href="#about"
                    className="text-gray-400 hover:text-[#22C15A] smooth-transition"
                  >
                    About
                  </a>
                </li>
                <li>
                  <a
                    href="#careers"
                    className="text-gray-400 hover:text-[#22C15A] smooth-transition"
                  >
                    Careers
                  </a>
                </li>
                <li>
                  <a
                    href="#blog"
                    className="text-gray-400 hover:text-[#22C15A] smooth-transition"
                  >
                    Blog
                  </a>
                </li>
                <li>
                  <a
                    href="#press"
                    className="text-gray-400 hover:text-[#22C15A] smooth-transition"
                  >
                    Press
                  </a>
                </li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-3 body-s">
                <li>
                  <a
                    href="#help"
                    className="text-gray-400 hover:text-[#22C15A] smooth-transition"
                  >
                    Help Center
                  </a>
                </li>
                <li>
                  <a
                    href="#contact"
                    className="text-gray-400 hover:text-[#22C15A] smooth-transition"
                  >
                    Contact Us
                  </a>
                </li>
                <li>
                  <a
                    href="#status"
                    className="text-gray-400 hover:text-[#22C15A] smooth-transition"
                  >
                    Status
                  </a>
                </li>
                <li>
                  <a
                    href="#security"
                    className="text-gray-400 hover:text-[#22C15A] smooth-transition"
                  >
                    Security
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="body-s text-gray-400">
              © 2024 ReviseIt. All rights reserved.
            </p>

            <div className="flex items-center gap-6">
              <a
                href="#privacy"
                className="body-s text-gray-400 hover:text-[#22C15A] smooth-transition"
              >
                Privacy
              </a>
              <a
                href="#terms"
                className="body-s text-gray-400 hover:text-[#22C15A] smooth-transition"
              >
                Terms
              </a>
              <a
                href="#cookies"
                className="body-s text-gray-400 hover:text-[#22C15A] smooth-transition"
              >
                Cookies
              </a>
            </div>

            <div className="flex items-center gap-4">
              <a
                href="#linkedin"
                className="w-10 h-10 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:text-[#22C15A] hover:border-[#22C15A] smooth-transition"
                aria-label="LinkedIn"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
              </a>
              <a
                href="#twitter"
                className="w-10 h-10 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:text-[#22C15A] hover:border-[#22C15A] smooth-transition"
                aria-label="Twitter"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="#youtube"
                className="w-10 h-10 rounded-full border border-gray-700 flex items-center justify-center text-gray-400 hover:text-[#22C15A] hover:border-[#22C15A] smooth-transition"
                aria-label="YouTube"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
