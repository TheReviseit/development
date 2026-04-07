import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";
import { generateComparisonData, getCompetitorPositioning } from "@/lib/seo/competitor-analysis";

/**
 * Flowauxi vs Shopify Comparison Page (FAANG-Level SEO)
 * =======================================================
 *
 * PRIMARY KEYWORD: Flowauxi vs Shopify (480 volume, 20 difficulty)
 * SEARCH INTENT: Commercial
 * CONTENT FORMAT: Comparison Table
 * WORD COUNT: 2500-3500 words
 *
 * FAANG Principles:
 * - Unbiased comparison with fair treatment of competitor
 * - Detailed feature/price breakdown
 * - Clear differentiators
 * - Strong CTA placement
 * - FAQ schema for PAA capture
 */

export const metadata: Metadata = {
  title: "Flowauxi vs Shopify: Which is Better for WhatsApp Commerce? (2026)",
  description:
    "Compare Flowauxi vs Shopify for WhatsApp commerce. Get a free website + 7-day trial. AI chatbot included, India-focused payments. Save ₹12,000/year. See full feature comparison.",
  keywords: [
    "Flowauxi vs Shopify",
    "Shopify alternatives India",
    "WhatsApp store builder comparison",
    "best ecommerce platform for WhatsApp",
    "Shopify vs WhatsApp store",
    "free Shopify alternative",
    "ecommerce platform comparison India",
    "Flowauxi pricing vs Shopify",
    "WhatsApp commerce platform",
  ],
  openGraph: {
    title: "Flowauxi vs Shopify: Which is Better for WhatsApp Commerce?",
    description: "Full comparison: features, pricing, WhatsApp integration, India focus. Plans start at ₹1,999/month with 7-day free trial.",
    url: "https://www.flowauxi.com/compare/shopify",
    images: [{ url: "/og-flowauxi-vs-shopify.png", width: 1200, height: 630 }],
    type: "website",
  },
  alternates: { canonical: "https://www.flowauxi.com/compare/shopify" },
};

const FAQ_QUESTIONS = [
  {
    question: "Is Flowauxi better than Shopify for selling on WhatsApp?",
    answer:
      "For businesses that sell primarily on WhatsApp, Flowauxi is better suited than Shopify. Flowauxi is built WhatsApp-native with AI chatbot, order automation, invoice delivery, and payment integration all included. Shopify requires installing multiple apps for WhatsApp features. Flowauxi gives you a free website when you create an account plus a 7-day free trial, while Shopify starts at ₹1,499/month. However, if you need a full website with extensive theme customization, Shopify may be better.",
  },
  {
    question: "What's the difference between Flowauxi and Shopify pricing?",
    answer:
      "Flowauxi gives you a free website when you sign up, plus a 7-day free trial of all features. Shopify starts at ₹1,499/month (₹20/month for first year) and requires additional apps for WhatsApp features (₹500-2000/month extra). Flowauxi's plans start at ₹1,999/month. Over a year with similar features, Flowauxi can save you money compared to Shopify + WhatsApp apps. Flowauxi also doesn't require hosting fees since your store is included.",
  },
  {
    question: "Can I switch from Shopify to Flowauxi?",
    answer:
      "Yes, you can migrate from Shopify to Flowauxi. You'll need to: 1) Export your product catalog from Shopify (CSV file), 2) Import products into Flowauxi, 3) Set up WhatsApp Business API connection, 4) Configure payment gateway (Razorpay, Stripe, etc.), 5) Redirect your domain or share your Flowauxi store link. Flowauxi support can assist with migration. Many D2C brands have successfully migrated from Shopify to Flowauxi for WhatsApp-first selling.",
  },
  {
    question: "Does Flowauxi have a website builder like Shopify?",
    answer:
      "Flowauxi focuses on WhatsApp commerce and provides a shareable store link (e.g., store.flowauxi.com/store/yourstore) optimized for mobile WhatsApp browsing, included free when you create your account. If you need a full website with custom themes, Shopify may be better. If your customers primarily shop via WhatsApp, Flowauxi provides a better experience with faster setup and integrated features.",
  },
  {
    question: "Which is better for small businesses in India: Flowauxi or Shopify?",
    answer:
      "For small businesses in India, Flowauxi offers better value: 1) Free website included when you create an account, 2) 7-day free trial of all features, 3) Plans starting at ₹1,999/month, 4) Razorpay, Paytm, PhonePe, UPI built-in, 5) AI chatbot included, 6) WhatsApp-native selling. Shopify is better for businesses that need an independent website with extensive customization. For WhatsApp-first businesses selling to Indian customers, Flowauxi offers better value with integrated features.",
  },
  {
    question: "Does Flowauxi integrate with Shopify?",
    answer:
      "Flowauxi and Shopify are separate platforms. If you have an existing Shopify store, you can use Flowauxi as your WhatsApp commerce channel while keeping your Shopify website. Products can be synced between platforms. However, for most businesses, choosing one platform is simpler. If you're starting fresh and plan to sell primarily on WhatsApp, Flowauxi alone is sufficient. If you need both a website and WhatsApp selling, some businesses use both platforms.",
  },
];

export default function CompareShopifyPage() {
  const faqSchema = generateFaqSchemaForPAA(FAQ_QUESTIONS);
  const { features, pricing, integrations } = generateComparisonData("Shopify");
  const { strengths, weaknesses, ourDifferentiators } = getCompetitorPositioning("Shopify");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ComparisonTable",
            name: "Flowauxi vs Shopify Comparison",
            description: "Detailed comparison of Flowauxi and Shopify for WhatsApp commerce in India",
            about: [
              { "@type": "SoftwareApplication", name: "Flowauxi", applicationCategory: "BusinessApplication" },
              { "@type": "SoftwareApplication", name: "Shopify", applicationCategory: "BusinessApplication" },
            ],
          }),
        }}
      />

      <main className="max-w-7xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/compare" className="hover:text-gray-700">Compare</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Flowauxi vs Shopify</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
          Flowauxi vs Shopify: Which is Better for Your Business?
        </h1>

        <p className="text-xl text-gray-600 mb-8 max-w-3xl">
          Full comparison of features, pricing, and WhatsApp integration. See why 3,000+ businesses use
          Flowauxi for WhatsApp-first commerce. Plans start at ₹1,999/month with a free website + 7-day trial.
        </p>

        {/* Quick Verdict */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-12">
          <h2 className="text-xl font-semibold text-green-800 mb-2">Quick Verdict</h2>
          <p className="text-green-700">
            <strong>Choose Flowauxi if:</strong> You sell primarily on WhatsApp, want AI chatbot included,
            need India-focused payments (Razorpay, UPI), and want a free website with 7-day free trial.
          </p>
          <p className="text-green-700 mt-2">
            <strong>Choose Shopify if:</strong> You need a standalone website with custom themes, extensive
            app marketplace, and don't primarily sell on WhatsApp.
          </p>
        </div>

        {/* Quick Comparison Table */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Quick Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left p-4 border font-semibold">Feature</th>
                  <th className="text-center p-4 border font-semibold text-green-600">Flowauxi</th>
                  <th className="text-center p-4 border font-semibold">Shopify</th>
                </tr>
              </thead>
<tbody>
                <tr>
                  <td className="p-4 border">Starting Price</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">₹1,999/month (7-day free trial)</td>
                  <td className="p-4 border text-center text-lg">₹1,499/month</td>
                </tr>
                <tr>
                  <td className="p-4 border">Free Website Included</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">✓ Yes</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">✓ Yes</td>
                </tr>
                <tr>
                  <td className="p-4 border">WhatsApp Features Cost</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">₹0 (included)</td>
                  <td className="p-4 border text-center">₹500-2000/month extra</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Detailed Feature Comparison */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Detailed Feature Comparison</h2>

          <div className="space-y-8">
            {/* WhatsApp Integration */}
            <div>
              <h3 className="text-xl font-semibold mb-4">WhatsApp Integration</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 border border-green-200 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-800 mb-2">Flowauxi</h4>
                  <ul className="text-gray-700 space-y-1 text-sm">
                    <li>✓ Built WhatsApp-native from day one</li>
                    <li>✓ AI chatbot trained on product catalog</li>
                    <li>✓ Order booking via WhatsApp chat</li>
                    <li>✓ Invoice PDF delivery via WhatsApp</li>
                    <li>✓ Order status updates via WhatsApp</li>
                    <li>✓ Customer support escalation</li>
                    <li>✓ Product catalog sharing</li>
                  </ul>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <h4 className="font-semibold text-gray-800 mb-2">Shopify</h4>
                  <ul className="text-gray-700 space-y-1 text-sm">
                    <li>✗ Requires WhatsApp Business app (₹500-2000/mo)</li>
                    <li>✗ Chatbot requires additional paid app</li>
                    <li>✗ Order updates via third-party integration</li>
                    <li>✗ Invoice delivery requires app</li>
                    <li>✗ Limited WhatsApp automation</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Pricing */}
            <div>
              <h3 className="text-xl font-semibold mb-4">Pricing Comparison</h3>
              <div className="bg-gray-50 p-6 rounded-lg">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Plan</th>
                      <th className="text-center py-2 text-green-600">Flowauxi</th>
                      <th className="text-center py-2">Shopify</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="py-3">Free / Starter</td>
                      <td className="text-center text-green-600 font-semibold">Free Forever</td>
                      <td className="text-center">₹1,499/mo (₹20/mo for 1st year)</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3">Growth / Basic</td>
                      <td className="text-center">₹799/mo</td>
                      <td className="text-center">₹3,499/mo</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-3">Pro / Shopify</td>
                      <td className="text-center">₹1,999/mo</td>
                      <td className="text-center">₹6,999/mo</td>
                    </tr>
                    <tr>
                      <td className="py-3 font-semibold">Annual Cost (with WhatsApp apps)</td>
                      <td className="text-center text-green-600 font-semibold">₹0 - ₹24,000</td>
                      <td className="text-center">₹24,000 - ₹96,000+</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Support */}
            <div>
              <h3 className="text-xl font-semibold mb-4">Support for Indian Businesses</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 border border-green-200 bg-green-50 rounded-lg">
                  <h4 className="font-semibold text-green-800 mb-2">Flowauxi</h4>
                  <ul className="text-gray-700 space-y-1 text-sm">
                    <li>✓ India-first design (Razorpay, Paytm, UPI built-in)</li>
                    <li>✓ Hindi + English support</li>
                    <li>✓ IST timezone support</li>
                    <li>✓ WhatsApp support channel</li>
                    <li>✓ GST-compliant invoicing</li>
                  </ul>
                </div>
                <div className="p-4 border border-gray-200 rounded-lg">
                  <h4 className="font-semibold text-gray-800 mb-2">Shopify</h4>
                  <ul className="text-gray-700 space-y-1 text-sm">
                    <li>✓ Global platform with India support</li>
                    <li>✗ Payments require Razorpay app</li>
                    <li>✗ Limited Hindi support</li>
                    <li>✓ 24/7 chat, email support</li>
                    <li>✓ GST configuration available</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* When to Choose */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">When to Choose Each Platform</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="border border-green-200 p-6 rounded-lg bg-green-50">
              <h3 className="text-xl font-semibold text-green-800 mb-4">Choose Flowauxi If:</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>You sell primarily on WhatsApp</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>You want AI chatbot included free</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>You're a small business in India</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>You need India payments (UPI, Razorpay)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>You want to start with zero monthly cost</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span>Your customers message on WhatsApp</span>
                </li>
              </ul>
              <Link href="/signup" className="mt-6 inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700">
                Start Free with Flowauxi
              </Link>
            </div>
            <div className="border border-gray-200 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Choose Shopify If:</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>You need a standalone website</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>You want extensive theme customization</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>You need access to 8,000+ apps</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>You sell primarily on your own website</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>You're an enterprise with complex needs</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 font-bold">✓</span>
                  <span>You don't rely on WhatsApp for sales</span>
                </li>
              </ul>
              <p className="mt-6 text-gray-600 text-sm">
                Consider Flowauxi as a WhatsApp channel if you choose Shopify for your website.
              </p>
            </div>
          </div>
        </section>

        {/* Migration CTA */}
        <section className="mb-16 bg-gray-100 p-8 rounded-lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Already Using Shopify?</h2>
          <p className="text-gray-600 mb-6">
            Migrating from Shopify to Flowauxi is easy. Export your products, import to Flowauxi, connect
            WhatsApp, and start selling. Our support team can help you migrate in under an hour.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link href="/signup" className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">
              Start Migration — It's Free
            </Link>
            <Link href="/contact" className="px-6 py-3 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50">
              Talk to Migration Team
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {FAQ_QUESTIONS.map((faq, i) => (
              <details key={i} className="group border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between cursor-pointer p-4 font-semibold text-gray-900">
                  {faq.question}
                  <span className="text-green-600 text-2xl group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="p-4 pt-0 text-gray-600"><p>{faq.answer}</p></div>
              </details>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-green-600 text-white rounded-lg p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Start? Try Flowauxi Free</h2>
          <p className="mb-8 text-green-100">Join 500+ businesses selling on WhatsApp. AI chatbot included.</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/signup" className="px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50">
              Start Free Today
            </Link>
            <Link href="/features/whatsapp-store" className="px-8 py-4 border-2 border-white rounded-lg font-semibold hover:bg-green-700">
              See WhatsApp Store Features
            </Link>
          </div>
        </section>

        {/* Related Comparisons */}
        <section className="mt-16">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Other Comparisons</h2>
          <div className="flex flex-wrap gap-4">
            <Link href="/compare/dukaan" className="text-green-600 hover:underline">Flowauxi vs Dukaan</Link>
            <Link href="/compare/wati" className="text-green-600 hover:underline">Flowauxi vs Wati</Link>
            <Link href="/compare/woocommerce" className="text-green-600 hover:underline">Flowauxi vs WooCommerce</Link>
          </div>
        </section>
      </main>
    </>
  );
}