import type { Metadata } from "next";
import Link from "next/link";

/**
 * Compare Hub Page (FAANG-Level SEO)
 * ===================================
 *
 * PILLAR PAGE for all comparisons
 * Targets comparison keywords and commercial intent
 */

export const metadata: Metadata = {
  title: "Compare Flowauxi - Alternatives to Shopify, Dukaan, Wati | Flowauxi",
  description:
    "Compare Flowauxi with Shopify, Dukaan, Wati, WooCommerce for WhatsApp commerce. See pricing, features, and why businesses choose Flowauxi.",
  keywords: [
    "Flowauxi vs Shopify",
    "Flowauxi vs Dukaan",
    "Flowauxi vs Wati",
    "Flowauxi vs WooCommerce",
    "Shopify alternatives",
    "Dukaan alternatives",
    "WhatsApp store comparison",
    "ecommerce platform comparison India",
    "best WhatsApp store builder",
    "free Shopify alternative",
  ],
  openGraph: {
    title: "Compare Flowauxi with Alternatives",
    description: "Full comparison: Flowauxi vs Shopify, Dukaan, Wati, WooCommerce. See who wins.",
    url: "https://www.flowauxi.com/compare",
    images: [{ url: "/og-compare.png", width: 1200, height: 630 }],
  },
  alternates: { canonical: "https://www.flowauxi.com/compare" },
};

const COMPARISONS = [
  {
    name: "Shopify",
    tagline: "Global e-commerce giant",
    volume: "18K/month",
    winner: "WhatsApp commerce",
    href: "/compare/shopify",
    keyDifferences: [
      "Flowauxi has free forever plan (Shopify: ₹1,499/month)",
      "AI chatbot included free (Shopify: paid app)",
      "WhatsApp-native (Shopify: requires apps)",
      "India payments built-in (Shopify: limited)",
    ],
  },
  {
    name: "Dukaan",
    tagline: "Indian D2C platform",
    volume: "890/month",
    winner: "AI chatbot + features",
    href: "/compare/dukaan",
    keyDifferences: [
      "Flowauxi has AI chatbot included (Dukaan: paid)",
      "Invoice automation free (Dukaan: paid addon)",
      "Google Sheets sync free (Dukaan: not available)",
      "Both have free plan",
    ],
  },
  {
    name: "Wati",
    tagline: "WhatsApp Business API platform",
    volume: "120/month",
    winner: "E-commerce features",
    href: "/compare/wati",
    keyDifferences: [
      "Flowauxi is e-commerce focused (Wati: API only)",
      "Store builder included (Wati: no store)",
      "Invoice automation (Wati: not available)",
      "Payment integration (Wati: not available)",
    ],
  },
  {
    name: "WooCommerce",
    tagline: "WordPress e-commerce plugin",
    volume: "320/month",
    winner: "Ease of use",
    href: "/compare/woocommerce",
    keyDifferences: [
      "Flowauxi: no hosting/setup (WooCommerce: needs WordPress)",
      "WhatsApp-native (WooCommerce: requires plugins)",
      "Managed platform (WooCommerce: self-hosted)",
      "Both have free options",
    ],
  },
  {
    name: "Interakt",
    tagline: "WhatsApp Business API platform",
    volume: "170/month",
    winner: "Features + pricing",
    href: "/compare/interakt",
    keyDifferences: [
      "Flowauxi has store builder (Interakt: API only)",
      "Free plan available (Interakt: paid only)",
      "Invoice automation (Interakt: not available)",
      "Both have chatbot features",
    ],
  },
];

export default function CompareHubPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-16">
      <nav className="text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Compare</span>
      </nav>

      <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
        Compare Flowauxi with Alternatives
      </h1>

      <p className="text-xl text-gray-600 mb-12 max-w-3xl">
        See how Flowauxi compares to Shopify, Dukaan, Wati, WooCommerce, and other e-commerce platforms
        for WhatsApp commerce. Find the best fit for your business.
      </p>

      {/* Comparison Cards */}
      <div className="space-y-8 mb-16">
        {COMPARISONS.map((comp) => (
          <Link
            key={comp.href}
            href={comp.href}
            className="block p-6 bg-white border border-gray-200 rounded-lg hover:border-green-500 hover:shadow-lg transition group"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <h2 className="text-2xl font-bold group-hover:text-green-600 transition">
                    Flowauxi vs {comp.name}
                  </h2>
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded">
                    {comp.winner}
                  </span>
                </div>
                <p className="text-gray-500 mb-4">
                  {comp.tagline} • {comp.volume} search volume
                </p>
                <ul className="grid md:grid-cols-2 gap-2">
                  {comp.keyDifferences.map((diff) => (
                    <li key={diff} className="text-sm text-gray-600 flex items-start gap-2">
                      <span className="text-green-500">✓</span> {diff}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="text-green-600 font-medium">
                See full comparison →
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick Summary Table */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Quick Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="text-left p-4 border font-semibold">Feature</th>
                <th className="text-center p-4 border font-semibold text-green-600">Flowauxi</th>
                <th className="text-center p-4 border font-semibold">Shopify</th>
                <th className="text-center p-4 border font-semibold">Dukaan</th>
                <th className="text-center p-4 border font-semibold">Wati</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-4 border">Free Plan</td>
                <td className="p-4 border text-center text-green-600 font-semibold">✓ Forever</td>
                <td className="p-4 border text-center text-red-500">✗</td>
                <td className="p-4 border text-center">✓ Limited</td>
                <td className="p-4 border text-center text-red-500">✗</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="p-4 border">AI Chatbot</td>
                <td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td>
                <td className="p-4 border text-center text-red-500">✗ App</td>
                <td className="p-4 border text-center text-red-500">✗ Paid</td>
                <td className="p-4 border text-center">✓ Paid</td>
              </tr>
              <tr>
                <td className="p-4 border">WhatsApp Store</td>
                <td className="p-4 border text-center text-green-600 font-semibold">✓ Built-in</td>
                <td className="p-4 border text-center text-red-500">✗ App</td>
                <td className="p-4 border text-center">✓</td>
                <td className="p-4 border text-center text-red-500">✗</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="p-4 border">Invoice Automation</td>
                <td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td>
                <td className="p-4 border text-center text-red-500">✗ App</td>
                <td className="p-4 border text-center text-red-500">✗ Paid</td>
                <td className="p-4 border text-center text-red-500">✗</td>
              </tr>
              <tr>
                <td className="p-4 border">India Payments</td>
                <td className="p-4 border text-center text-green-600 font-semibold">✓ Built-in</td>
                <td className="p-4 border text-center">✓ App</td>
                <td className="p-4 border text-center">✓</td>
                <td className="p-4 border text-center text-red-500">✗</td>
              </tr>
              <tr className="bg-gray-100 font-semibold">
                <td className="p-4 border">Starting Price</td>
                <td className="p-4 border text-center text-green-600 text-lg">Free Forever</td>
                <td className="p-4 border text-center">₹1,499/mo</td>
                <td className="p-4 border text-center">₹0/mo</td>
                <td className="p-4 border text-center">₹999/mo</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Why Compare */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Why Businesses Choose Flowauxi</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-6 border border-gray-200 rounded-lg">
            <div className="text-3xl mb-4">💰</div>
            <h3 className="font-semibold mb-2">Free Forever Plan</h3>
            <p className="text-gray-600 text-sm">
              Start with our free plan and upgrade only when you need. No credit card required.
            </p>
          </div>
          <div className="p-6 border border-gray-200 rounded-lg">
            <div className="text-3xl mb-4">🇮🇳</div>
            <h3 className="font-semibold mb-2">India-First Design</h3>
            <p className="text-gray-600 text-sm">
              Razorpay, Paytm, UPI built-in. Hindi support. GST-compliant invoicing.
            </p>
          </div>
          <div className="p-6 border border-gray-200 rounded-lg">
            <div className="text-3xl mb-4">🤖</div>
            <h3 className="font-semibold mb-2">AI Chatbot Included</h3>
            <p className="text-gray-600 text-sm">
              No extra chatbot fees. AI customer support included free with every plan.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-green-600 text-white rounded-lg p-12 text-center">
        <h2 className="text-3xl font-bold mb-4">Ready to Try Flowauxi?</h2>
        <p className="mb-8 text-green-100">Start free and see why businesses choose Flowauxi for WhatsApp commerce.</p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link href="/signup" className="px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50 transition">
            Start Free Trial
          </Link>
          <Link href="/features" className="px-8 py-4 border-2 border-white rounded-lg font-semibold hover:bg-green-700 transition">
            See All Features
          </Link>
        </div>
      </section>
    </main>
  );
}