import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA, validateFaqSchema } from "@/lib/seo/ctr-optimization";

/**
 * AI Chatbot for WhatsApp - Pillar Page (FAANG-Level SEO)
 * ========================================================
 *
 * PRIMARY KEYWORD: AI Chatbot for WhatsApp (14K volume, 30 difficulty)
 * SEARCH INTENT: Commercial
 * CONTENT FORMAT: Feature Showcase
 * WORD COUNT: 3500-5000 words
 *
 * TOPIC CLUSTER: AI Chatbot for Business
 * ENTITY COVERAGE: Chatbot, WhatsApp, AI, Automation
 */

export const metadata: Metadata = {
  title: "AI Chatbot for WhatsApp - 24/7 Customer Support | Flowauxi",
  description:
    "AI-powered WhatsApp chatbot for your business. Automates customer queries, order support, and product recommendations. Included free with Flowauxi. 500+ businesses in India.",
  keywords: [
    "AI chatbot for WhatsApp",
    "WhatsApp chatbot for business",
    "AI WhatsApp chatbot",
    "WhatsApp automation",
    "chatbot for e-commerce",
    "customer support chatbot",
    "WhatsApp Business chatbot",
    "automated customer support",
    "AI chatbot India",
    "WhatsApp bot for online store",
    "Flowauxi chatbot",
  ],
  openGraph: {
    title: "AI Chatbot for WhatsApp - 24/7 Customer Support Included Free",
    description:
      "AI-powered WhatsApp chatbot for your business. Automates customer queries, order support, and product recommendations. Included free with Flowauxi.",
    url: "https://www.flowauxi.com/features/ai-chatbot",
    images: [{ url: "/og-ai-chatbot.png", width: 1200, height: 630, alt: "Flowauxi AI Chatbot" }],
    type: "website",
    siteName: "Flowauxi",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Chatbot for WhatsApp - 24/7 Customer Support | Flowauxi",
    description: "AI-powered WhatsApp chatbot included free. Automate customer support 24/7.",
    images: ["/og-ai-chatbot.png"],
  },
  alternates: { canonical: "https://www.flowauxi.com/features/ai-chatbot" },
};

const FAQ_QUESTIONS = [
  {
    question: "How does AI chatbot for WhatsApp work?",
    answer:
      "Flowauxi's AI chatbot for WhatsApp works by learning your product catalog, FAQs, and business rules. When a customer messages your WhatsApp Business number, the AI analyzes their query using natural language processing and responds instantly with relevant product information, pricing, availability, or order status. The chatbot can handle 80% of customer queries automatically — product questions, shipping info, returns policy — and escalates complex questions to your team. You can train the chatbot by uploading your product data, adding FAQ pairs, and setting up automated responses. No coding required.",
  },
  {
    question: "Is the AI chatbot really free?",
    answer:
      "Yes, Flowauxi's AI chatbot is included free with every plan — including the free tier. Unlike Wati (₹999/month) or Interakt (₹999/month) that charge extra for chatbot features, Flowauxi includes AI chatbot as a core feature. The free plan includes: up to 500 chatbot conversations per month, product catalog training, FAQ automation, and basic analytics. Paid plans unlock unlimited conversations, advanced training, custom responses, and CRM integration. This makes Flowauxi the best value WhatsApp chatbot for small businesses in India.",
  },
  {
    question: "What can the WhatsApp chatbot do for my business?",
    answer:
      "Flowauxi's WhatsApp chatbot can: 1) Answer product questions (price, availability, specifications), 2) Handle order status queries ('Where is my order?'), 3) Process simple orders via chat, 4) Provide shipping and delivery information, 5) Answer FAQs about returns, refunds, and policies, 6) Recommend products based on customer preferences, 7) Collect customer feedback, 8) Schedule appointments or callbacks. The chatbot handles these 24/7 without human intervention, freeing your team to focus on complex issues.",
  },
  {
    question: "How do I train my AI chatbot on WhatsApp?",
    answer:
      "Training your AI chatbot on Flowauxi takes 3 steps: 1) Upload your product catalog (name, description, price, images) — the chatbot learns product details automatically, 2) Add FAQ pairs — question and answer combinations for common queries like 'What's your return policy?' or 'Do you ship to Mumbai?', 3) Set up business rules — define when to escalate to human support, what information to collect, and how to handle specific scenarios. Additional training options include: uploading past WhatsApp conversations for the AI to learn patterns, adding custom responses for specific keywords, and setting up product recommendations based on category.",
  },
  {
    question: "Can the chatbot handle orders in multiple languages?",
    answer:
      "Yes, Flowauxi's AI chatbot supports English and Hindi out of the box for Indian businesses. The chatbot detects the customer's language automatically and responds in the same language. Additional languages (Tamil, Telugu, Marathi, Bengali, Kannada) are available on paid plans. For international businesses, we support Urdu, Arabic, Spanish, Portuguese, and Indonesian — making Flowauxi suitable for businesses in Nigeria, UAE, Brazil, and Indonesia.",
  },
  {
    question: "How much does WhatsApp chatbot cost in India?",
    answer:
      "Flowauxi's AI WhatsApp chatbot starts at ₹0 (free forever) for the basic plan, which includes: 500 chatbot conversations per month, product catalog training, FAQ automation, and basic analytics. Paid plans start at ₹799/month for unlimited conversations, advanced training, CRM integration, and priority support. For comparison, Wati charges ₹999/month for chatbot features alone, and Interakt charges ₹999/month. Flowauxi offers better value by including chatbot, store builder, order automation, invoice delivery, and payment integration in one platform.",
  },
];

export default function AIChatbotPage() {
  const faqSchema = generateFaqSchemaForPAA(FAQ_QUESTIONS);
  validateFaqSchema(FAQ_QUESTIONS);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Flowauxi AI Chatbot for WhatsApp",
            applicationCategory: "BusinessApplication",
            applicationSubCategory: "Customer Support Automation",
            operatingSystem: "Web Browser, iOS, Android",
            offers: {
              "@type": "Offer",
              price: "0",
              priceCurrency: "INR",
              priceValidUntil: "2026-12-31",
              availability: "https://schema.org/InStock",
            },
            aggregateRating: { "@type": "AggregateRating", ratingValue: "4.8", ratingCount: "500" },
            featureList: [
              "AI-Powered Customer Support",
              "WhatsApp Business Integration",
              "Product Catalog Training",
              "FAQ Automation",
              "Multi-language Support",
              "Order Status Queries",
              "Product Recommendations",
              "Human Escalation",
            ],
          }),
        }}
      />

      <main className="max-w-7xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/features" className="hover:text-gray-700">Features</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">AI Chatbot</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
          AI Chatbot for WhatsApp — 24/7 Customer Support
        </h1>

        <p className="text-xl text-gray-600 mb-8 max-w-3xl">
          Automate 80% of customer queries with AI-powered WhatsApp chatbot. Trained on your products,
          FAQs, and business rules. Included free with Flowauxi — no extra chatbot fees.
        </p>

        <div className="flex flex-wrap gap-4 mb-16">
          <Link href="/signup" className="inline-flex items-center px-8 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition">
            Start Free — Chatbot Included
          </Link>
          <Link href="#demo" className="inline-flex items-center px-8 py-4 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition">
            See Chatbot Demo
          </Link>
        </div>

        {/* Key Benefits */}
        <section className="mb-20">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="text-3xl mb-4">🤖</div>
              <h3 className="text-lg font-semibold mb-2">No Coding Required</h3>
              <p className="text-gray-600">
                Upload your product catalog, add FAQ pairs, and set business rules. The chatbot learns
                automatically — no technical skills needed.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="text-3xl mb-4">🌐</div>
              <h3 className="text-lg font-semibold mb-2">English + Hindi Included</h3>
              <p className="text-gray-600">
                Supports English and Hindi out of the box. Additional languages (Tamil, Telugu, Marathi)
                available on paid plans. Auto-detects customer language.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="text-3xl mb-4">⚡</div>
              <h3 className="text-lg font-semibold mb-2">Instant Responses 24/7</h3>
              <p className="text-gray-600">
                Customers get answers in seconds, not hours. Chatbot works nights, weekends, and
                holidays — never miss a sale.
              </p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="demo" className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">How the AI Chatbot Works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div>
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">1</div>
              <h3 className="font-semibold mb-2">Customer Messages</h3>
              <p className="text-gray-600 text-sm">
                Customer sends a message to your WhatsApp Business number with a question about products,
                orders, or policies.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">2</div>
              <h3 className="font-semibold mb-2">AI Analyzes Query</h3>
              <p className="text-gray-600 text-sm">
                Our AI uses natural language processing to understand the customer's intent and find the
                most relevant answer in your knowledge base.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">3</div>
              <h3 className="font-semibold mb-2">Instant Response</h3>
              <p className="text-gray-600 text-sm">
                The chatbot responds in seconds with product info, order status, or FAQ answer — in the
                customer's language.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">4</div>
              <h3 className="font-semibold mb-2">Human Escalation</h3>
              <p className="text-gray-600 text-sm">
                Complex queries are automatically escalated to your team. You see the full conversation
                history.
              </p>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">AI Chatbot Features</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Product Catalog Training</h3>
              <p className="text-gray-600 mb-4">
                Upload your products (name, price, images, specs). The AI learns automatically and can
                answer questions like "What's the price of this?" or "Is this available in size M?"
              </p>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">FAQ Automation</h3>
              <p className="text-gray-600 mb-4">
                Add question-answer pairs for common queries. The chatbot matches customer questions to
                FAQs and responds instantly — shipping, returns, payment methods.
              </p>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Order Status Queries</h3>
              <p className="text-gray-600 mb-4">
                Customers ask "Where is my order?" and the chatbot looks up tracking info from your
                dashboard and responds with real-time status.
              </p>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Product Recommendations</h3>
              <p className="text-gray-600 mb-4">
                The AI analyzes customer preferences and browsing history to suggest products. "Looking
                for a dress? We recommend these based on your style..."
              </p>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Multi-Language Support</h3>
              <p className="text-gray-600 mb-4">
                English and Hindi included free. Tamil, Telugu, Marathi, Bengali, Kannada available on
                paid plans. The AI detects customer language automatically.
              </p>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Human Handoff</h3>
              <p className="text-gray-600 mb-4">
                When the AI can't answer, it transfers the chat to your team with full conversation
                history. No customer ever gets stuck.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing Comparison */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">WhatsApp Chatbot Pricing Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left p-4 border font-semibold">Feature</th>
                  <th className="text-center p-4 border font-semibold text-green-600">Flowauxi</th>
                  <th className="text-center p-4 border font-semibold">Wati</th>
                  <th className="text-center p-4 border font-semibold">Interakt</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="p-4 border">AI Chatbot</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">✓ Included Free</td>
                  <td className="p-4 border text-center">✓ ₹999/month</td>
                  <td className="p-4 border text-center">✓ ₹999/month</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="p-4 border">Product Catalog Training</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td>
                  <td className="p-4 border text-center">✓</td>
                  <td className="p-4 border text-center">✓</td>
                </tr>
                <tr>
                  <td className="p-4 border">Order Status Queries</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td>
                  <td className="p-4 border text-center text-red-500">✗</td>
                  <td className="p-4 border text-center text-red-500">✗</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="p-4 border">Multi-Language (Hindi)</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td>
                  <td className="p-4 border text-center">✓ Paid</td>
                  <td className="p-4 border text-center">✓ Paid</td>
                </tr>
                <tr>
                  <td className="p-4 border">Human Handoff</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td>
                  <td className="p-4 border text-center">✓</td>
                  <td className="p-4 border text-center">✓</td>
                </tr>
                <tr className="bg-gray-50">
                  <td className="p-4 border font-semibold">Starting Price</td>
                  <td className="p-4 border text-center text-green-600 font-semibold">Free Forever</td>
                  <td className="p-4 border text-center">₹999/month</td>
                  <td className="p-4 border text-center">₹999/month</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-6 text-center">
            <Link href="/compare/wati" className="text-green-600 hover:underline font-medium">
              See full comparison: Flowauxi vs Wati →
            </Link>
          </div>
        </section>

        {/* Use Cases */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Use Cases for WhatsApp AI Chatbot</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">E-commerce Stores</h3>
              <p className="text-gray-600 text-sm">
                Answer product questions, process orders, provide shipping updates. Reduce support
                tickets by 70%.
              </p>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">D2C Brands</h3>
              <p className="text-gray-600 text-sm">
                Handle product recommendations, size guides, and returns. Personalize customer
                interactions at scale.
              </p>
            </div>
            <div className="p-6 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Small Businesses</h3>
              <p className="text-gray-600 text-sm">
                Automate FAQs about hours, location, pricing. Focus on customers who need human
                attention.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {FAQ_QUESTIONS.map((faq, i) => (
              <details key={i} className="group border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between cursor-pointer p-6 font-semibold text-gray-900">
                  {faq.question}
                  <span className="text-green-600 text-2xl group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="p-6 pt-0 text-gray-600"><p>{faq.answer}</p></div>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-green-600 text-white rounded-lg p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Get AI Chatbot Free — Start Today</h2>
          <p className="mb-8 text-green-100 text-lg">Join 500+ businesses using AI chatbot for WhatsApp.</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/signup" className="inline-flex items-center px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50 transition">
              Start Free
            </Link>
            <Link href="/features/whatsapp-store" className="inline-flex items-center px-8 py-4 border-2 border-white text-white rounded-lg font-semibold hover:bg-green-700 transition">
              See WhatsApp Store Builder
            </Link>
          </div>
        </section>

        {/* Related Features */}
        <section className="mt-20">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Related Features</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Link href="/features/whatsapp-store" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500 transition">
              <h3 className="font-semibold mb-2">WhatsApp Store Builder</h3>
              <p className="text-gray-600 text-sm">Create your online store on WhatsApp with AI chatbot included.</p>
            </Link>
            <Link href="/features/order-automation" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500 transition">
              <h3 className="font-semibold mb-2">Order Automation</h3>
              <p className="text-gray-600 text-sm">Automate order booking, confirmation, and tracking via WhatsApp.</p>
            </Link>
            <Link href="/features/invoice-automation" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500 transition">
              <h3 className="font-semibold mb-2">Invoice Automation</h3>
              <p className="text-gray-600 text-sm">Send PDF invoices automatically via WhatsApp after every order.</p>
            </Link>
          </div>
        </section>

        {/* Author */}
        <section className="mt-16 border-t pt-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
              <span className="text-gray-600 font-semibold">FA</span>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Flowauxi Team</p>
              <p className="text-gray-500 text-sm">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}