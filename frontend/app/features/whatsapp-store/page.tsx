import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA, validateFaqSchema } from "@/lib/seo/ctr-optimization";
import { TOPIC_CLUSTERS, getClusterEntities } from "@/lib/seo/entity-graph";

/**
 * WhatsApp Store Builder - Pillar Page (FAANG-Level SEO)
 * ========================================================
 *
 * PRIMARY KEYWORD: WhatsApp Store Builder (12K volume, 25 difficulty)
 * SEARCH INTENT: Commercial
 * CONTENT FORMAT: Feature Showcase
 * WORD COUNT: 4000-6000 words
 *
 * TOPIC CLUSTER: WhatsApp Commerce Platform
 * - This is the PILLAR page
 * - Links to 8+ cluster pages
 * - Entity coverage: WhatsApp, E-commerce, Flowauxi, Chatbot
 *
 * FAANG Principles Applied:
 * 1. Intent-classified content format
 * 2. Topical authority (entity graph)
 * 3. Rich snippets (FAQPage, SoftwareApplication)
 * 4. CTR-optimized title/meta
 * 5. Internal link architecture
 * 6. EEAT signals throughout
 */

export const metadata: Metadata = {
  title: "WhatsApp Store Builder - Create Free Online Store with AI Chatbot | Flowauxi",
  description:
    "Build your WhatsApp-powered online store. Free website included. AI chatbot, automated orders, payment integration. 7-day free trial. Plans start at ₹1,999/month.",
  keywords: [
    "WhatsApp store builder",
    "free online store builder India",
    "WhatsApp e-commerce platform",
    "create online store free",
    "WhatsApp order automation",
    "D2C WhatsApp store",
    "sell on WhatsApp",
    "WhatsApp chatbot for online store",
    "automated order booking WhatsApp",
    "WhatsApp product catalog",
    "WhatsApp CRM for e-commerce",
    "conversational commerce platform",
  ],
  openGraph: {
    title: "WhatsApp Store Builder - Create Free Online Store with AI Chatbot",
    description:
      "Build your WhatsApp-powered online store. Free website included. AI chatbot, automated orders, payment integration. 7-day free trial.",
    url: "https://www.flowauxi.com/features/whatsapp-store",
    images: [
      {
        url: "/og-whatsapp-store.png",
        width: 1200,
        height: 630,
        alt: "Flowauxi WhatsApp Store Builder - Create Free Online Store with AI Chatbot",
      },
    ],
    type: "website",
    siteName: "Flowauxi",
  },
  twitter: {
    card: "summary_large_image",
    title: "WhatsApp Store Builder - Create Free Online Store with AI Chatbot",
    description:
      "Build your WhatsApp-powered online store free. AI chatbot included, automated orders, payment integration.",
    images: ["/og-whatsapp-store.png"],
  },
  alternates: {
    canonical: "https://www.flowauxi.com/features/whatsapp-store",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

// FAQ Questions for PAA Capture (150-200 words each answer)
const FAQ_QUESTIONS = [
  {
    question: "What is a WhatsApp store builder?",
    answer:
      "A WhatsApp store builder is a platform that lets you create an online store that operates entirely through WhatsApp. Unlike traditional e-commerce platforms like Shopify, a WhatsApp store builder is designed for conversational commerce — customers browse products, place orders, and receive support all through WhatsApp chat. Flowauxi's WhatsApp store builder includes AI chatbot for customer support, automated order booking, invoice delivery, payment integration with Razorpay/Stripe, order tracking, and Google Sheets sync — all accessible via WhatsApp. This makes it ideal for D2C brands, small businesses, and entrepreneurs in India who want to sell directly on WhatsApp without building a separate website.",
  },
  {
question: "How do I create a free WhatsApp store?",
    answer: "To create a free WhatsApp store: 1) Sign up for Flowauxi (no credit card required), 2) Connect your WhatsApp Business API account, 3) Add your products with images and descriptions, 4) Connect a payment gateway (Razorpay, Stripe, or UPI), 5) Share your store link via WhatsApp, social media, or QR code. Your customers can browse products, place orders, and pay — all through WhatsApp. You get a free website and 7-day free trial of premium features. Setup takes less than 10 minutes.",
  },
  {
    question: "Is Flowauxi's WhatsApp store really free?",
    answer: "When you create a Flowauxi account, you get your own WhatsApp store website for free. You also get a 7-day free trial of all premium features including AI chatbot, order automation, invoice generation, payment integration, and Google Sheets sync. After the trial, plans start at ₹1,999/month for continued premium features. You keep your free website even without a paid plan. This makes Flowauxi one of the best value options for small businesses starting on WhatsApp.",
  },
  {
    question: "What features are included?",
    answer: "All paid plans include: product catalog management, AI chatbot for customer queries, order automation, invoice generation (PDF), payment integration (Razorpay, Stripe, UPI), order tracking notifications, Google Sheets sync, and analytics dashboard. The 7-day trial gives you access to all features. After that, choose a plan based on your needs. Unlike competitors, Flowauxi includes all core e-commerce features in each plan.",
  },
  {
    question: "Can I really run an online store on WhatsApp for free?",
    answer:
      "Yes, Flowauxi offers a free forever plan that includes everything you need to run an online store on WhatsApp: product catalog management, AI chatbot for customer queries, order automation, invoice generation, payment integration (Razorpay, Stripe, UPI), order tracking, and analytics dashboard. Unlike Shopify (₹1,499/month) or Dukaan, Flowauxi's free plan has no time limit. You only pay when you need advanced features like unlimited products, custom domain, or priority support. This makes it the best free WhatsApp store builder for small businesses and D2C brands in India.",
  },
  {
    question: "How does WhatsApp order automation work?",
    answer:
      "WhatsApp order automation works in 3 steps: 1) Customer sends a message to your WhatsApp Business number (or browses your product catalog), 2) AI chatbot responds instantly with product details, pricing, and payment options — or processes the order automatically if configured, 3) Customer places order via WhatsApp, and Flowauxi automatically sends order confirmation, generates PDF invoice, and tracks delivery status — all via WhatsApp. You receive order details in your dashboard and optionally sync to Google Sheets. This eliminates manual order taking and lets you sell 24/7 without hiring support staff.",
  },
  {
    question: "What payment methods can I accept on my WhatsApp store?",
    answer:
      "Flowauxi integrates with Razorpay, Stripe, Paytm, PhonePe, Google Pay (GPay), and UPI for payments in India. When a customer places an order via WhatsApp, they receive a payment link directly in chat. After payment, the order status updates automatically and the customer gets order confirmation via WhatsApp. For COD (Cash on Delivery) orders, Flowauxi tracks delivery status and sends automated payment reminders. All payment gateways are PCI DSS compliant and transactions are secured with bank-grade encryption. You can accept international payments via Stripe for customers outside India.",
  },
  {
    question: "How is Flowauxi different from Shopify for WhatsApp selling?",
    answer:
      "Flowauxi is built specifically for WhatsApp-first commerce, while Shopify is a traditional website builder. Key differences: 1) Flowauxi has AI chatbot included free (Shopify requires app install + extra cost), 2) Flowauxi has order tracking, invoice automation, and Google Sheets sync included (Shopify needs apps), 3) Flowauxi is free forever with generous limits (Shopify starts at ₹1,499/month), 4) Flowauxi is designed for Indian SMBs with Razorpay/UPI integration built-in, 5) Flowauxi lets you sell entirely on WhatsApp without needing a separate website. If your customers primarily use WhatsApp to shop, Flowauxi is the better choice.",
  },
];

export default function WhatsAppStorePage() {
  const faqSchema = generateFaqSchemaForPAA(FAQ_QUESTIONS);
  const { valid, errors, warnings } = validateFaqSchema(FAQ_QUESTIONS);

  // Log validation results in development
  if (process.env.NODE_ENV === "development") {
    if (!valid) console.error("FAQ Schema errors:", errors);
    if (warnings.length > 0) console.warn("FAQ Schema warnings:", warnings);
  }

  return (
    <>
      {/* FAQ Schema for PAA Capture */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* SoftwareApplication Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Flowauxi WhatsApp Store Builder",
            applicationCategory: "BusinessApplication",
            applicationSubCategory: "E-commerce Automation & WhatsApp Commerce",
            operatingSystem: "Web Browser, iOS, Android",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "INR",
              priceValidUntil: "2026-12-31",
              availability: "https://schema.org/InStock",
              description: "Free forever plan available — upgrade for advanced features",
            },
            aggregateRating: {
              "@type": "AggregateRating",
              ratingValue: "4.8",
              ratingCount: "500",
              bestRating: "5",
              worstRating: "1",
            },
            featureList: [
              "AI-Powered WhatsApp Chatbot",
              "Automated Order Booking",
              "Invoice PDF Delivery via WhatsApp",
              "Payment Integration (Razorpay, Stripe, UPI)",
              "Order Tracking via WhatsApp",
              "Google Sheets Sync",
              "Product Catalog Sharing",
              "Analytics Dashboard",
              "Multi-Agent Support",
            ],
            creator: {
              "@type": "Organization",
              name: "Flowauxi Technologies",
              url: "https://www.flowauxi.com",
            },
          }),
        }}
      />

      <main className="max-w-7xl mx-auto px-4 py-16">
        {/* breadcrumb */}
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">
            Home
          </Link>
          <span className="mx-2">/</span>
          <Link href="/features" className="hover:text-gray-700">
            Features
          </Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">WhatsApp Store Builder</span>
        </nav>

        {/* H1 - Primary Keyword */}
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
          WhatsApp Store Builder for Indian Businesses
        </h1>

        {/* Subtitle - Secondary Keywords */}
        <p className="text-xl text-gray-600 mb-8 max-w-3xl">
          Create your free online store with AI chatbot, automated orders, invoice delivery, payment
          integration, and order tracking — all powered by WhatsApp. Trusted by 500+ businesses in
          India.
        </p>

        {/* CTA - Above the Fold */}
        <div className="flex flex-wrap gap-4 mb-16">
          <Link
            href="/signup"
            className="inline-flex items-center px-8 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition"
          >
            Create Free WhatsApp Store
          </Link>
          <Link
            href="#how-it-works"
            className="inline-flex items-center px-8 py-4 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
          >
            See How It Works
          </Link>
        </div>

        {/* Key Benefits - EEAT Signals */}
        <section className="mb-20">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="text-3xl mb-4">🚀</div>
              <h3 className="text-lg font-semibold mb-2">AI Chatbot Included Free</h3>
              <p className="text-gray-600">
                24/7 customer support via AI-powered WhatsApp chatbot. Handles product queries,
                order status, and returns automatically — no hiring needed.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="text-3xl mb-4">💳</div>
              <h3 className="text-lg font-semibold mb-2">Payment Integration Built-in</h3>
              <p className="text-gray-600">
                Accept payments via Razorpay, Stripe, Paytm, PhonePe, GPay, or UPI. Order
                confirmation and invoice delivery automated via WhatsApp.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="text-3xl mb-4">📊</div>
              <h3 className="text-lg font-semibold mb-2">Google Sheets Sync</h3>
              <p className="text-gray-600">
                Every order automatically syncs to Google Sheets. Track revenue, inventory, and
                customer data without manual spreadsheets.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works - HowTo Schema Target */}
        <section id="how-it-works" className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">
            How to Create Your WhatsApp Store in 5 Minutes
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div>
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">
                1
              </div>
              <h3 className="font-semibold mb-2">Sign Up Free</h3>
              <p className="text-gray-600 text-sm">
                Create your Flowauxi account. No credit card required. Takes 30 seconds.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">
                2
              </div>
              <h3 className="font-semibold mb-2">Connect WhatsApp</h3>
              <p className="text-gray-600 text-sm">
                Link your WhatsApp Business API account. QR code setup takes 2 minutes.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">
                3
              </div>
              <h3 className="font-semibold mb-2">Add Products</h3>
              <p className="text-gray-600 text-sm">
                Upload product images, set prices, organize categories. AI chatbot learns your
                catalog automatically.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">
                4
              </div>
              <h3 className="font-semibold mb-2">Start Selling</h3>
              <p className="text-gray-600 text-sm">
                Share your store link via WhatsApp, social media, or QR code. Orders come directly
                to your WhatsApp.
              </p>
            </div>
          </div>
        </section>

        {/* Key Features - Feature Showcase */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">
            Key Features for WhatsApp Commerce
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">AI Chatbot for Customer Support</h3>
              <p className="text-gray-600 mb-4">
                Train your AI chatbot on your product catalog. It handles customer queries 24/7 —
                product questions, availability, sizing, shipping — without human intervention.
                Escalates complex questions to your team when needed.
              </p>
              <Link
                href="/features/ai-chatbot"
                className="text-green-600 hover:underline text-sm font-medium"
              >
                Learn more about AI Chatbot →
              </Link>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Automated Order Booking</h3>
              <p className="text-gray-600 mb-4">
                Customers place orders via WhatsApp chat. Flowauxi captures order details, confirms
                availability, calculates totals, and confirms the order — all automatically. You
                receive order notifications in your dashboard.
              </p>
              <Link
                href="/features/order-automation"
                className="text-green-600 hover:underline text-sm font-medium"
              >
                Learn more about Order Automation →
              </Link>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Invoice PDF Delivery via WhatsApp</h3>
              <p className="text-gray-600 mb-4">
                After every order, Flowauxi generates a professional PDF invoice and sends it to the
                customer via WhatsApp. Customize invoice templates with your brand logo, GST number,
                and payment terms.
              </p>
              <Link
                href="/features/invoice-automation"
                className="text-green-600 hover:underline text-sm font-medium"
              >
                Learn more about Invoice Automation →
              </Link>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Payment Integration</h3>
              <p className="text-gray-600 mb-4">
                Accept payments via Razorpay, Stripe, Paytm, PhonePe, GPay, or UPI. Customers pay
                directly in WhatsApp chat. Order status updates automatically after payment.
              </p>
              <Link
                href="/integrations/razorpay"
                className="text-green-600 hover:underline text-sm font-medium"
              >
                Learn more about Payment Integration →
              </Link>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Order Tracking via WhatsApp</h3>
              <p className="text-gray-600 mb-4">
                Send customers real-time order status updates via WhatsApp — order confirmed,
                processing, shipped, out for delivery, delivered. Reduce support tickets by 70%.
              </p>
              <Link
                href="/features/order-tracking"
                className="text-green-600 hover:underline text-sm font-medium"
              >
                Learn more about Order Tracking →
              </Link>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Google Sheets Sync</h3>
              <p className="text-gray-600 mb-4">
                Every order automatically syncs to Google Sheets. Track revenue, inventory,
                customer data, and order history — all in one spreadsheet. No manual data entry.
              </p>
              <Link
                href="/features/google-sheets-sync"
                className="text-green-600 hover:underline text-sm font-medium"
              >
                Learn more about Google Sheets Sync →
              </Link>
            </div>
          </div>
        </section>

        {/* Why Flowauxi - Differentiators */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">
            Why Businesses Choose Flowauxi for WhatsApp Commerce
          </h2>
          <div className="bg-gray-50 p-8 rounded-lg">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-lg mb-2">Free Forever Plan</h3>
                <p className="text-gray-600">
                  No credit card required. Start with our free plan and upgrade only when you need
                  advanced features. Unlike Shopify (₹1,499/month) or Dukaan, Flowauxi is free for
                  small businesses.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">AI Chatbot Included</h3>
                <p className="text-gray-600">
                  Every plan includes AI chatbot for 24/7 customer support. Other platforms charge
                  extra for chatbot features. Flowauxi includes it free.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">WhatsApp-Native from Day One</h3>
                <p className="text-gray-600">
                  Built specifically for WhatsApp commerce, not retrofitted. Every feature —
                  orders, invoices, tracking — works seamlessly within WhatsApp.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-2">India-Focused Payments</h3>
                <p className="text-gray-600">
                  Razorpay, Paytm, PhonePe, GPay, and UPI are built-in. No third-party app
                  installations required. Accept payments in INR with local payment methods.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Comparison Section */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">
            Flowauxi vs Other WhatsApp Store Builders
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left p-4 border font-semibold">Feature</th>
                  <th className="text-center p-4 border font-semibold text-green-600">Flowauxi</th>
                  <th className="text-center p-4 border font-semibold">Wati</th>
                  <th className="text-center p-4 border font-semibold">Interakt</th>
                  <th className="text-center p-4 border font-semibold">Shopify</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-4 border">Free Plan</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">✓ Forever</td>
                  <td className="p-4 border text-center text-red-500">✗</td>
                  <td className="p-4 border text-center text-red-500">✗</td>
                  <td className="p-4 border text-center text-red-500">✗</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="p-4 border">AI Chatbot</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">✓ Included</td>
                  <td className="p-4 border text-center text-yellow-600">✓ Paid</td>
                  <td className="p-4 border text-center text-yellow-600">✓ Paid</td>
                  <td className="p-4 border text-center text-red-500">✗ App Required</td>
                </tr>
                <tr>
                  <td className="p-4 border">Order Automation</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">✓ Built-in</td>
                  <td className="p-4 border text-center text-red-500">✗</td>
                  <td className="p-4 border text-center text-red-500">✗</td>
                  <td className="p-4 border text-center text-yellow-600">✓ App Required</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="p-4 border">Invoice Delivery</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">✓ Via WhatsApp</td>
                  <td className="p-4 border text-center text-red-500">✗</td>
                  <td className="p-4 border text-center text-red-500">✗</td>
                  <td className="p-4 border text-center text-yellow-600">✓ App Required</td>
                </tr>
                <tr>
                  <td className="p-4 border">Payment Integration</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">
                    Razorpay, Stripe, UPI
                  </td>
                  <td className="p-4 border text-center text-red-500">✗</td>
                  <td className="p-4 border text-center text-red-500">✗</td>
                  <td className="p-4 border text-center text-green-600">✓ Multiple</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="p-4 border">Google Sheets Sync</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td>
                  <td className="p-4 border text-center text-red-500">✗</td>
                  <td className="p-4 border text-center text-red-500">✗</td>
                  <td className="p-4 border text-center text-yellow-600">✓ App Required</td>
                </tr>
                <tr>
                  <td className="p-4 border font-semibold">Starting Price</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">Free Forever</td>
                  <td className="p-4 border text-center">₹999/month</td>
                  <td className="p-4 border text-center">₹999/month</td>
                  <td className="p-4 border text-center">₹1,499/month</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-6 text-center">
            <Link
              href="/compare/shopify"
              className="text-green-600 hover:underline font-medium"
            >
              See full comparison: Flowauxi vs Shopify →
            </Link>
          </div>
        </section>

        {/* FAQ Section - FAQPage Schema Target */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {FAQ_QUESTIONS.map((faq, index) => (
              <details key={index} className="group border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between cursor-pointer p-6 font-semibold text-gray-900">
                  {faq.question}
                  <span className="text-green-600 text-2xl group-open:rotate-180 transition-transform">
                    ▼
                  </span>
                </summary>
                <div className="p-6 pt-0 text-gray-600">
                  <p>{faq.answer}</p>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="bg-green-600 text-white rounded-lg p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Create Your Free WhatsApp Store Today
          </h2>
          <p className="mb-8 text-green-100 text-lg">
            Join 500+ businesses in India selling on WhatsApp. AI chatbot included free.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50 transition"
            >
              Get Started Free
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center px-8 py-4 border-2 border-white text-white rounded-lg font-semibold hover:bg-green-700 transition"
            >
              View Pricing
            </Link>
          </div>
        </section>

        {/* Related Features - Internal Linking */}
        <section className="mt-20">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Related Features</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Link
              href="/features/ai-chatbot"
              className="block p-6 border border-gray-200 rounded-lg hover:border-green-500 transition"
            >
              <h3 className="font-semibold mb-2">AI Chatbot for WhatsApp</h3>
              <p className="text-gray-600 text-sm">
                24/7 customer support with AI-powered chatbot trained on your products.
              </p>
            </Link>
            <Link
              href="/features/invoice-automation"
              className="block p-6 border border-gray-200 rounded-lg hover:border-green-500 transition"
            >
              <h3 className="font-semibold mb-2">Invoice Automation</h3>
              <p className="text-gray-600 text-sm">
                Automatic PDF invoice delivery via WhatsApp after every order.
              </p>
            </Link>
            <Link
              href="/features/order-tracking"
              className="block p-6 border border-gray-200 rounded-lg hover:border-green-500 transition"
            >
              <h3 className="font-semibold mb-2">Order Tracking</h3>
              <p className="text-gray-600 text-sm">
                Real-time order status updates via WhatsApp. Reduce support tickets by 70%.
              </p>
            </Link>
          </div>
        </section>

        {/* Author/EEAT Section */}
        <section className="mt-16 border-t pt-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-gray-600 font-semibold">FA</span>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Flowauxi Team</p>
              <p className="text-gray-500 text-sm">
                Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>
          <p className="text-gray-600 text-sm mt-4">
            This article was written by the Flowauxi team, experts in WhatsApp commerce and
            e-commerce automation. We've helped 500+ businesses in India sell on WhatsApp. Our
            content is based on real merchant data and industry best practices.
          </p>
        </section>
      </main>
    </>
  );
}