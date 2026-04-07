import type { Metadata } from "next";
import Link from "next/link";

/**
 * Features Hub Page (FAANG-Level SEO)
 * ===================================
 *
 * PILLAR PAGE for all features
 * Links to all feature cluster pages
 * Establishes topical authority for "WhatsApp Commerce Features"
 */

export const metadata: Metadata = {
  title: "Features - WhatsApp Commerce Platform for Indian Businesses | Flowauxi",
  description:
    "Explore Flowauxi features: AI chatbot, order automation, invoice delivery, payment integration, order tracking, and Google Sheets sync. Free forever plan available.",
  keywords: [
    "Flowauxi features",
    "WhatsApp commerce features",
    "AI chatbot features",
    "order automation features",
    "invoice automation",
    "payment integration",
    "order tracking",
    "Google Sheets sync",
    "WhatsApp store features",
  ],
  openGraph: {
    title: "Flowauxi Features - WhatsApp Commerce Platform",
    description: "Complete feature list: AI chatbot, order automation, payments, and more. Free forever.",
    url: "https://www.flowauxi.com/features",
    images: [{ url: "/og-features.png", width: 1200, height: 630 }],
  },
  alternates: { canonical: "https://www.flowauxi.com/features" },
};

const FEATURES = [
  {
    title: "WhatsApp Store Builder",
    description:
      "Create your free online store on WhatsApp. AI chatbot included, product catalog, order management, and payment integration — all in one platform.",
    features: ["Free forever plan", "AI chatbot included", "Order management", "Payment integration"],
    href: "/features/whatsapp-store",
    icon: "🏪",
    kw: "WhatsApp Store Builder",
  },
  {
    title: "AI Chatbot for WhatsApp",
    description:
      "AI-powered chatbot handles 80% of customer queries automatically. Trained on your products, FAQs, and business rules. Included free with every plan.",
    features: ["24/7 support", "Product training", "FAQ automation", "Human escalation"],
    href: "/features/ai-chatbot",
    icon: "🤖",
    kw: "AI Chatbot",
  },
  {
    title: "Order Automation",
    description:
      "Automate order booking, confirmation, and tracking via WhatsApp. Customers place orders in chat, you get notifications in your dashboard.",
    features: ["Auto order capture", "Instant confirmation", "Status updates", "Dashboard notifications"],
    href: "/features/order-automation",
    icon: "📦",
    kw: "Order Automation",
  },
  {
    title: "Invoice Automation",
    description:
      "Generate and send PDF invoices automatically via WhatsApp after every order. Brand your invoices with logo, GST, and payment terms.",
    features: ["PDF invoice generation", "WhatsApp delivery", "Brand customization", "GST compliant"],
    href: "/features/invoice-automation",
    icon: "📄",
    kw: "Invoice Automation",
  },
  {
    title: "Payment Integration",
    description:
      "Accept payments via Razorpay, Stripe, Paytm, PhonePe, and UPI. Customers pay directly in WhatsApp chat.",
    features: ["Razorpay", "Stripe", "UPI", "Instant confirmation"],
    href: "/integrations/razorpay",
    icon: "💳",
    kw: "Payment Integration",
  },
  {
    title: "Order Tracking",
    description:
      "Send real-time order status updates via WhatsApp. Customers track orders without calling support. Reduce support tickets by 70%.",
    features: ["Real-time updates", "WhatsApp notifications", "Delivery tracking", "Status timeline"],
    href: "/features/order-tracking",
    icon: "📍",
    kw: "Order Tracking",
  },
  {
    title: "Google Sheets Sync",
    description:
      "Every order syncs to Google Sheets automatically. Track revenue, inventory, and customer data in real-time without manual entry.",
    features: ["Auto sync", "Real-time data", "No manual entry", "Custom columns"],
    href: "/features/google-sheets-sync",
    icon: "📊",
    kw: "Google Sheets Sync",
  },
  {
    title: "Analytics Dashboard",
    description:
      "Track sales, orders, customers, and revenue in real-time. Understand what's working and optimize your WhatsApp commerce.",
    features: ["Sales analytics", "Customer insights", "Revenue tracking", "Export reports"],
    href: "/features/analytics",
    icon: "📈",
    kw: "Analytics Dashboard",
  },
];

export default function FeaturesHubPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-16">
      <nav className="text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Features</span>
      </nav>

      <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
        WhatsApp Commerce Platform Features
      </h1>

      <p className="text-xl text-gray-600 mb-12 max-w-3xl">
        Everything you need to run your business on WhatsApp. AI chatbot, order automation, invoice
        delivery, payment integration, and analytics — all in one platform.
      </p>

      {/* Features Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
        {FEATURES.map((feature) => (
          <Link
            key={feature.href}
            href={feature.href}
            className="block p-6 bg-white border border-gray-200 rounded-lg hover:border-green-500 hover:shadow-lg transition group"
          >
            <div className="text-4xl mb-4">{feature.icon}</div>
            <h2 className="text-xl font-semibold mb-2 group-hover:text-green-600 transition">{feature.title}</h2>
            <p className="text-gray-600 text-sm mb-4">{feature.description}</p>
            <ul className="space-y-1">
              {feature.features.map((f) => (
                <li key={f} className="text-sm text-gray-500 flex items-center gap-2">
                  <span className="text-green-500">✓</span> {f}
                </li>
              ))}
            </ul>
          </Link>
        ))}
      </div>

      {/* Why Flowauxi */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-8">Why Choose Flowauxi?</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="p-6 bg-green-50 rounded-lg">
            <h3 className="font-semibold text-green-800 mb-2">Free Forever Plan</h3>
            <p className="text-gray-600 text-sm">
              Start with our free plan and upgrade only when you need advanced features. No credit card
              required.
            </p>
          </div>
          <div className="p-6 bg-green-50 rounded-lg">
            <h3 className="font-semibold text-green-800 mb-2">All-in-One Platform</h3>
            <p className="text-gray-600 text-sm">
              No need for multiple apps. Chatbot, orders, invoices, payments, tracking — everything
              included.
            </p>
          </div>
          <div className="p-6 bg-green-50 rounded-lg">
            <h3 className="font-semibold text-green-800 mb-2">India-Focused</h3>
            <p className="text-gray-600 text-sm">
              Razorpay, Paytm, UPI, PhonePe built-in. Hindi support. GST-compliant invoicing. Support in
              IST timezone.
            </p>
          </div>
        </div>
      </section>

      {/* Comparison CTA */}
      <section className="bg-gray-100 p-8 rounded-lg mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Compare Flowauxi with Alternatives</h2>
        <p className="text-gray-600 mb-6">
          See how Flowauxi compares to Shopify, Dukaan, Wati, and other platforms for WhatsApp commerce.
        </p>
        <div className="flex flex-wrap gap-4">
          <Link href="/compare/shopify" className="text-green-600 hover:underline font-medium">
            Flowauxi vs Shopify →
          </Link>
          <Link href="/compare/dukaan" className="text-green-600 hover:underline font-medium">
            Flowauxi vs Dukaan →
          </Link>
          <Link href="/compare/wati" className="text-green-600 hover:underline font-medium">
            Flowauxi vs Wati →
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-600 text-white rounded-lg p-12 text-center">
        <h2 className="text-3xl font-bold mb-4">Get All Features — Start Free</h2>
        <p className="mb-8 text-green-100">AI chatbot, order automation, invoice delivery, and more. No credit card required.</p>
        <Link href="/signup" className="inline-block px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50 transition">
          Start Free Trial
        </Link>
      </section>
    </main>
  );
}