import Link from "next/link";
import {
  MessageSquare,
  ShoppingBag,
  BarChart3,
  Zap,
  Users,
  Globe,
  ArrowRight,
  Check,
  ChevronDown,
  Bot,
  Receipt,
  Send,
  TrendingUp,
  Clock,
  Shield,
} from "lucide-react";

/**
 * WhatsApp Automation for E-commerce — SEO Landing Page
 *
 * URL: www.flowauxi.com/whatsapp-automation-ecommerce
 *
 * This is the PRIMARY RANKING PAGE for the keyword cluster:
 * "WhatsApp automation for e-commerce"
 *
 * Content: 1500–2000 words, structured for Google NLP understanding.
 * Targets transactional + commercial search intent.
 */

// FAQ data for both rendering and JSON-LD
const faqs = [
  {
    question: "How do I automate WhatsApp orders for my online store?",
    answer:
      "To automate WhatsApp orders, connect your store to the WhatsApp Business API through Flowauxi. Once connected, set up your AI chatbot to handle incoming order requests. The chatbot shares your product catalog, confirms orders, generates invoices, and sends payment links — all through WhatsApp. Customers simply chat to place orders, and everything from confirmation to delivery updates is automated.",
  },
  {
    question: "What is the best WhatsApp chatbot for e-commerce?",
    answer:
      "Flowauxi is rated as one of the best WhatsApp chatbots for e-commerce businesses. It offers AI-powered conversations that handle product recommendations, order processing, payment collection, and customer support 24/7. Unlike generic chatbot platforms, Flowauxi is purpose-built for e-commerce with features like catalog sharing, automated invoicing, and WhatsApp CRM integration.",
  },
  {
    question: "How much does WhatsApp automation cost?",
    answer:
      "Flowauxi offers a 14-day free trial with no credit card required. Paid plans start from affordable tiers for small businesses and scale to enterprise plans for high-volume operations. WhatsApp Business API itself charges per-conversation fees set by Meta (approximately ₹0.35–₹0.90 per conversation in India). Flowauxi's platform fee includes AI chatbot, CRM, analytics, and unlimited team members.",
  },
  {
    question: "Can I integrate WhatsApp automation with Shopify?",
    answer:
      "Yes. Flowauxi integrates with popular e-commerce platforms including custom stores built on any stack. While Flowauxi also includes its own store builder (shop.flowauxi.com), you can use the WhatsApp automation features with your existing online store. Product catalogs sync automatically, and order notifications are sent via WhatsApp.",
  },
  {
    question: "Is WhatsApp automation legal for business in India?",
    answer:
      "Absolutely. WhatsApp automation is fully legal in India when using the official WhatsApp Business API. Flowauxi uses Meta's approved API channels, ensuring full compliance with WhatsApp's Business Policy and Commerce Policy. All messages are sent to opted-in customers using template-approved content. This is different from unauthorized bulk messaging tools which violate WhatsApp's terms.",
  },
  {
    question: "How do I send automated product catalogs on WhatsApp?",
    answer:
      "With Flowauxi, you add products to your dashboard (manually or via CSV import). Your AI chatbot then shares relevant products from the catalog when customers inquire. You can also broadcast product catalogs to segmented audiences. Each product message includes images, descriptions, prices, and a direct order button — all formatted for WhatsApp.",
  },
  {
    question:
      "What's the difference between WhatsApp Business App and WhatsApp Business API?",
    answer:
      "The WhatsApp Business App is a free app for small businesses with basic features like business profiles and quick replies. The WhatsApp Business API (used by Flowauxi) is designed for medium to large businesses and enables automation, chatbots, CRM integration, bulk messaging, and multi-agent support. The API requires a solution provider like Flowauxi but unlocks powerful automation capabilities that the app cannot provide.",
  },
  {
    question: "How to track orders through WhatsApp automation?",
    answer:
      "Flowauxi automatically sends order status updates via WhatsApp at every stage: order confirmation, payment received, processing, shipped, and delivered. Customers can also check order status anytime by messaging your WhatsApp number. The dashboard provides real-time order tracking, delivery analytics, and fulfillment reports.",
  },
];

export default function WhatsAppAutomationEcommercePage() {
  // JSON-LD structured data for this specific page
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "WhatsApp Automation for E-commerce",
    description:
      "Complete guide to automating your e-commerce business with WhatsApp. AI chatbots, order automation, CRM, and store builder.",
    url: "https://www.flowauxi.com/whatsapp-automation-ecommerce",
    isPartOf: {
      "@type": "WebSite",
      name: "Flowauxi",
      url: "https://www.flowauxi.com",
    },
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <>
      {/* Page-specific structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="min-h-screen bg-white">
        {/* Navigation */}
        <nav className="w-full bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <Link href="/" className="flex items-center gap-2">
                <img
                  src="/logo.png"
                  alt="Flowauxi Logo"
                  className="h-8 w-8 object-contain"
                />
                <span className="text-xl font-bold text-gray-900">
                  Flowauxi
                </span>
              </Link>
              <div className="flex items-center gap-4">
                <Link
                  href="/pricing"
                  className="hidden md:inline text-gray-600 hover:text-gray-900 font-medium transition-colors"
                >
                  Pricing
                </Link>
                <Link
                  href="/signup"
                  className="bg-gray-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-black transition-colors shadow-lg"
                >
                  Start Free Trial
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* ================================================================ */}
        {/* HERO — H1 with primary keyword */}
        {/* ================================================================ */}
        <section className="relative overflow-hidden pt-20 pb-16 md:pt-28 md:pb-24">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-green-500/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
          </div>

          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
            <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-medium mb-6 border border-green-200/50">
              <MessageSquare className="h-4 w-4" />
              <span>Trusted by 500+ e-commerce businesses in India</span>
            </div>

            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
              WhatsApp Automation for E-commerce:{" "}
              <span className="bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                Turn Chats into Sales Automatically
              </span>
            </h1>

            <h2 className="text-xl md:text-2xl text-gray-600 mb-10 max-w-3xl mx-auto leading-relaxed">
              AI Chatbots, Order Automation & CRM — Built for Modern Online
              Businesses
            </h2>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2 bg-gray-900 text-white px-8 py-4 rounded-xl font-semibold hover:bg-black transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-0.5 text-lg"
              >
                Start Free Trial
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="https://shop.flowauxi.com"
                className="inline-flex items-center gap-2 text-gray-700 font-medium hover:text-gray-900 transition-colors text-lg"
              >
                See WhatsApp Store Builder →
              </a>
            </div>

            <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-green-600" />
                14-day free trial
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-green-600" />
                No credit card
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-green-600" />
                WhatsApp Business API
              </span>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* SECTION 1 — What & Why (~400 words) */}
        {/* ================================================================ */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="prose prose-lg max-w-none">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                What Is WhatsApp Automation for E-commerce?
              </h2>

              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                <strong>WhatsApp automation for e-commerce</strong> is the
                practice of using the WhatsApp Business API and AI chatbots to
                automate customer conversations, order processing, and
                marketing for online businesses. Instead of manually
                responding to every customer message, businesses use platforms
                like Flowauxi to handle everything from product inquiries to
                order confirmations — automatically.
              </p>

              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                In 2026, the shift from email and SMS to{" "}
                <strong>conversational commerce</strong> is undeniable.
                WhatsApp has over 500 million users in India alone, and the
                platform boasts a{" "}
                <strong>98% open rate compared to email&apos;s 20%</strong>.
                For e-commerce businesses, this means customers are far more
                likely to see and respond to WhatsApp messages than any other
                channel.
              </p>

              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                Flowauxi is a{" "}
                <strong>
                  WhatsApp automation platform built specifically for
                  e-commerce
                </strong>
                . It combines an AI-powered chatbot with a complete store
                builder, CRM, and marketing automation system. Whether
                you&apos;re a D2C brand, a small business selling on
                Instagram, or an established retailer — Flowauxi gives you
                everything to automate your WhatsApp sales channel.
              </p>

              <p className="text-lg text-gray-700 leading-relaxed">
                Unlike generic WhatsApp tools that focus only on broadcasting,
                Flowauxi provides a{" "}
                <strong>
                  complete e-commerce automation stack
                </strong>
                : from automated order booking and invoice generation to
                customer relationship management and performance analytics.
                Every feature is designed around the unique needs of online
                sellers who want to{" "}
                <strong>scale their business through WhatsApp</strong>.
              </p>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* SECTION 2 — How It Works (~300 words) */}
        {/* ================================================================ */}
        <section className="py-16 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                How Flowauxi Automates Your E-commerce WhatsApp
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Three steps to automate your entire WhatsApp sales channel —
                from product discovery to delivery confirmation
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="relative bg-white border border-gray-200 rounded-2xl p-8 hover:shadow-xl transition-shadow">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-2xl font-bold mb-5 shadow-lg">
                  1
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  Connect Your Store & WhatsApp
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Sign up for Flowauxi, connect your WhatsApp Business API,
                  and import your product catalog. Works with any store —
                  custom built, Shopify, WooCommerce, or use our built-in
                  store builder at{" "}
                  <a
                    href="https://shop.flowauxi.com"
                    className="text-green-600 font-medium hover:underline"
                  >
                    shop.flowauxi.com
                  </a>
                  . Setup takes under 10 minutes with no coding required.
                </p>
              </div>

              <div className="relative bg-white border border-gray-200 rounded-2xl p-8 hover:shadow-xl transition-shadow">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-2xl font-bold mb-5 shadow-lg">
                  2
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  Set Up Your AI Chatbot
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Configure your AI chatbot to handle product inquiries,
                  share catalogs, process orders, and answer FAQs. The
                  chatbot learns from your products and policies. Set up
                  automated workflows for order confirmations, payment
                  reminders, and delivery updates — all sent via WhatsApp.
                </p>
              </div>

              <div className="relative bg-white border border-gray-200 rounded-2xl p-8 hover:shadow-xl transition-shadow">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-2xl font-bold mb-5 shadow-lg">
                  3
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  Automate Orders & Scale Sales
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Go live and let automation handle the heavy lifting.
                  Customers discover products, place orders, and receive
                  updates — all through WhatsApp chat. Use the analytics
                  dashboard to track conversions, revenue, and customer
                  engagement. Scale from 10 to 10,000 orders without hiring.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* SECTION 3 — Use Cases (~400 words) */}
        {/* ================================================================ */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Who Uses WhatsApp Automation for E-commerce?
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                From D2C brands to local retailers — WhatsApp automation
                works for every online seller
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-white rounded-2xl p-8 border border-gray-200 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white mb-4 shadow-lg">
                  <ShoppingBag className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  D2C Brands Selling Directly to Customers
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Direct-to-consumer brands use Flowauxi to automate their
                  entire WhatsApp sales funnel. From product discovery to
                  checkout to repeat purchases — the AI chatbot handles
                  customer conversations while the CRM tracks lifetime value.
                  Perfect for fashion, beauty, food, and lifestyle brands.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-8 border border-gray-200 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white mb-4 shadow-lg">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  Small Businesses Scaling from Instagram
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Many small businesses start selling on Instagram DMs but
                  quickly outgrow manual messaging. Flowauxi helps them
                  transition to WhatsApp automation with a professional
                  store, automated order booking, and customer management —
                  without hiring additional staff.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-8 border border-gray-200 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white mb-4 shadow-lg">
                  <Globe className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  Retailers Adding Conversational Commerce
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Established retailers and multi-channel sellers add
                  WhatsApp as a high-conversion sales channel. Flowauxi
                  integrates with existing catalogs and provides automated
                  order processing, reducing customer acquisition cost while
                  increasing repeat purchase rates through personalized
                  WhatsApp conversations.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-8 border border-gray-200 hover:shadow-lg transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white mb-4 shadow-lg">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  Service Businesses & Appointment-Based
                </h3>
                <p className="text-gray-600 leading-relaxed">
                  Salons, clinics, tutoring centers, and service providers
                  use WhatsApp automation for appointment booking, reminders,
                  and follow-ups. The AI chatbot handles scheduling, sends
                  automated confirmations, and collects payments — reducing
                  no-shows by over 60%.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* SECTION 4 — Comparison Table (~200 words) */}
        {/* ================================================================ */}
        <section className="py-16 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Flowauxi vs Traditional E-commerce Platforms
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                See why WhatsApp-native commerce outperforms traditional
                online stores
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-200">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="text-left px-6 py-4 font-semibold">
                      Feature
                    </th>
                    <th className="text-center px-6 py-4 font-semibold bg-green-700">
                      Flowauxi
                    </th>
                    <th className="text-center px-6 py-4 font-semibold">
                      Shopify
                    </th>
                    <th className="text-center px-6 py-4 font-semibold">
                      WooCommerce
                    </th>
                    <th className="text-center px-6 py-4 font-semibold">
                      Dukaan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["WhatsApp Order Automation", true, false, false, false],
                    ["AI Chatbot Built-in", true, false, false, false],
                    ["WhatsApp CRM", true, false, false, false],
                    ["Automated Invoicing via WhatsApp", true, false, false, false],
                    ["Product Catalog on WhatsApp", true, false, false, true],
                    ["No-Code Store Builder", true, true, false, true],
                    ["Marketing Automation", true, true, true, false],
                    ["India-First Pricing", true, false, false, true],
                  ].map(([feature, ...values], i) => (
                    <tr
                      key={i}
                      className={`border-t border-gray-100 ${
                        i % 2 === 0 ? "bg-white" : "bg-gray-50"
                      }`}
                    >
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {feature as string}
                      </td>
                      {(values as boolean[]).map((v, j) => (
                        <td key={j} className="text-center px-6 py-4">
                          {v ? (
                            <Check className="h-5 w-5 text-green-600 mx-auto" />
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* FEATURE GRID */}
        {/* ================================================================ */}
        <section className="py-16 bg-gray-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Key Features of WhatsApp E-commerce Automation
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Everything you need to automate orders, delight customers,
                and grow revenue through WhatsApp
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: <Bot className="h-7 w-7" />,
                  title: "AI-Powered WhatsApp Chatbot",
                  desc: "24/7 intelligent conversations that handle product inquiries, process orders, and resolve customer issues. Trained on your catalog and policies for accurate, contextual responses.",
                  gradient: "from-green-500 to-emerald-600",
                },
                {
                  icon: <ShoppingBag className="h-7 w-7" />,
                  title: "Automated Order Booking",
                  desc: "Customers place orders directly through WhatsApp chat. AI confirms quantities, calculates totals, generates invoices, and sends payment links — zero manual work.",
                  gradient: "from-blue-500 to-cyan-600",
                },
                {
                  icon: <Receipt className="h-7 w-7" />,
                  title: "WhatsApp Invoice & Payments",
                  desc: "Automatic invoice generation and payment link delivery via WhatsApp. Supports UPI, credit cards, and net banking. Payment confirmations sent instantly.",
                  gradient: "from-purple-500 to-pink-600",
                },
                {
                  icon: <Users className="h-7 w-7" />,
                  title: "WhatsApp CRM & Customer Data",
                  desc: "Automatically capture customer data from conversations. Track order history, segment audiences, and personalize follow-up messages for higher retention.",
                  gradient: "from-orange-500 to-red-600",
                },
                {
                  icon: <Send className="h-7 w-7" />,
                  title: "Smart Broadcasting & Campaigns",
                  desc: "Send targeted product launches, offers, and re-engagement campaigns to segmented customer lists. Track delivery, open rates, and conversions in real-time.",
                  gradient: "from-indigo-500 to-purple-600",
                },
                {
                  icon: <BarChart3 className="h-7 w-7" />,
                  title: "Analytics & Conversion Tracking",
                  desc: "Monitor WhatsApp message delivery rates, chatbot accuracy, order conversion funnels, and revenue attribution. Data-driven insights to optimize your WhatsApp commerce strategy.",
                  gradient: "from-teal-500 to-emerald-600",
                },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-7 border border-gray-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  <div
                    className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.gradient} text-white mb-4 shadow-lg`}
                  >
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 text-sm leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* FAQ SECTION — 8 PAA-targeted questions */}
        {/* ================================================================ */}
        <section className="py-16 bg-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-lg text-gray-600">
                Everything you need to know about WhatsApp automation for
                e-commerce
              </p>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <details
                  key={i}
                  className="group bg-gray-50 rounded-xl border border-gray-200 overflow-hidden"
                >
                  <summary className="flex items-center justify-between px-6 py-5 cursor-pointer font-semibold text-gray-900 hover:bg-gray-100 transition-colors">
                    <span className="pr-4">{faq.question}</span>
                    <ChevronDown className="h-5 w-5 text-gray-500 group-open:rotate-180 transition-transform flex-shrink-0" />
                  </summary>
                  <div className="px-6 pb-5 text-gray-600 leading-relaxed">
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* CTA SECTION */}
        {/* ================================================================ */}
        <section className="py-20 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern-white opacity-5" />
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6">
              Start Automating Your E-commerce WhatsApp Today
            </h2>
            <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
              Join 500+ businesses already scaling their sales with WhatsApp
              automation. 14-day free trial, no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/signup"
                className="group inline-flex items-center gap-2 bg-white text-gray-900 px-8 py-4 rounded-xl font-bold hover:bg-gray-100 transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-0.5 text-lg"
              >
                Start Free Trial
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="https://shop.flowauxi.com"
                className="inline-flex items-center gap-2 text-gray-300 font-medium hover:text-white transition-colors text-lg"
              >
                See WhatsApp Store Builder →
              </a>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* CROSS-DOMAIN LINKS (Internal linking for SEO) */}
        {/* ================================================================ */}
        <section className="py-12 bg-gray-50 border-t border-gray-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-4 gap-8 text-center">
              <a
                href="https://shop.flowauxi.com"
                className="group"
              >
                <ShoppingBag className="h-8 w-8 text-indigo-600 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                <p className="font-semibold text-gray-900">
                  WhatsApp Store Builder
                </p>
                <p className="text-sm text-gray-500">
                  Build your e-commerce store
                </p>
              </a>
              <a
                href="https://marketing.flowauxi.com"
                className="group"
              >
                <Send className="h-8 w-8 text-purple-600 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                <p className="font-semibold text-gray-900">
                  WhatsApp Marketing Automation
                </p>
                <p className="text-sm text-gray-500">
                  Scale your campaigns
                </p>
              </a>
              <Link href="/pricing" className="group">
                <BarChart3 className="h-8 w-8 text-green-600 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                <p className="font-semibold text-gray-900">Pricing Plans</p>
                <p className="text-sm text-gray-500">
                  Affordable plans for every size
                </p>
              </Link>
              <a
                href="https://api.flowauxi.com"
                className="group"
              >
                <Shield className="h-8 w-8 text-blue-600 mx-auto mb-2 group-hover:scale-110 transition-transform" />
                <p className="font-semibold text-gray-900">
                  OTP Verification API
                </p>
                <p className="text-sm text-gray-500">
                  Secure authentication
                </p>
              </a>
            </div>
          </div>
        </section>

        {/* Minimal Footer */}
        <footer className="bg-gray-900 text-gray-400 py-8">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-sm">
              © 2026 Flowauxi Technologies. All rights reserved. |{" "}
              <Link
                href="/privacy"
                className="hover:text-white transition-colors"
              >
                Privacy Policy
              </Link>{" "}
              |{" "}
              <Link
                href="/terms"
                className="hover:text-white transition-colors"
              >
                Terms of Service
              </Link>
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
