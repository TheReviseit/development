"use client";

import Header from "./Header/Header";
import HeroSection from "./HeroSection/HeroSection";
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

      {/* Trust Section - Trusted by businesses across India */}
      <section className="py-12 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-gray-500 text-sm font-medium tracking-wide uppercase">
            Trusted by businesses across India
          </p>
        </div>
      </section>

      {/* WhatsApp Features Section */}
      <WhatsAppFeatures />

      {/* Products — Internal Links to Subdomains (SEO Authority Flow) */}
      <section className="py-20 bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Complete WhatsApp Automation Suite
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Everything you need to automate your business — from WhatsApp
              e-commerce stores to marketing automation and OTP verification.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <a
              href="https://shop.flowauxi.com"
              className="group relative bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:border-indigo-200 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform">
                🛍️
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                WhatsApp Store Builder
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Build your online store with WhatsApp order automation, AI
                chatbot for e-commerce, automated invoicing & customer
                management.
              </p>
              <span className="inline-flex items-center text-indigo-600 text-sm font-medium mt-3 group-hover:gap-2 transition-all">
                Start selling on WhatsApp →
              </span>
            </a>

            <a
              href="https://marketing.flowauxi.com"
              className="group relative bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:border-purple-200 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform">
                📢
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                WhatsApp Marketing Automation
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                AI-powered WhatsApp marketing campaigns, multi-channel
                broadcasting, audience segmentation & conversion analytics.
              </p>
              <span className="inline-flex items-center text-purple-600 text-sm font-medium mt-3 group-hover:gap-2 transition-all">
                Scale WhatsApp marketing →
              </span>
            </a>

            <a
              href="https://api.flowauxi.com"
              className="group relative bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:border-blue-200 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform">
                🔐
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                OTP Verification API
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Enterprise OTP verification via WhatsApp & SMS. 99.9% uptime,
                sub-200ms delivery, developer-friendly SDKs.
              </p>
              <span className="inline-flex items-center text-blue-600 text-sm font-medium mt-3 group-hover:gap-2 transition-all">
                View docs →
              </span>
            </a>

            <a
              href="https://pages.flowauxi.com"
              className="group relative bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-xl hover:border-teal-200 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform">
                🎨
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Portfolio Website Builder
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Build stunning portfolio & showcase websites. 50+ templates,
                drag-and-drop builder, custom domains & SEO.
              </p>
              <span className="inline-flex items-center text-teal-600 text-sm font-medium mt-3 group-hover:gap-2 transition-all">
                Build portfolio →
              </span>
            </a>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <Testimonials />

      {/* Contact Section */}
      <ContactSection />

      {/* Footer */}
      <Footer />
    </div>
  );
}
