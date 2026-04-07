import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

/**
 * Order Automation - Feature Page
 * PRIMARY KEYWORD: WhatsApp order automation (880 volume)
 */

export const metadata: Metadata = {
  title: "Order Automation via WhatsApp - Automate Order Booking | Flowauxi",
  description:
    "Automate order booking via WhatsApp. Customers place orders in chat, you get notifications. 24/7 order capture without human intervention. Free plan.",
  keywords: [
    "order automation",
    "WhatsApp order automation",
    "automated order booking",
    "order processing automation",
    "WhatsApp order capture",
    "e-commerce order automation",
  ],
  alternates: { canonical: "https://www.flowauxi.com/features/order-automation" },
};

const FAQ_QUESTIONS = [
  {
    question: "How does automated order booking work?",
    answer:
      "Automated order booking works via WhatsApp chat. Customers browse your product catalog in WhatsApp, select products, specify quantities, and confirm orders — all via chat. Flowauxi's AI chatbot captures order details, calculates totals, confirms availability, and sends order confirmation automatically. You receive notifications in your dashboard.",
  },
  {
    question: "Can customers place orders without human intervention?",
    answer:
      "Yes, customers can place orders 24/7 without human intervention. The AI chatbot guides customers through product selection, quantity, size/color options, shipping address, and payment method. For complex orders, the chatbot can escalate to your team. 80% of orders are processed automatically.",
  },
  {
    question: "What happens after an order is placed?",
    answer:
      "After order placement: 1) Customer receives confirmation via WhatsApp, 2) You receive notification in dashboard and email, 3) Order appears in your order management, 4) If integrated, order syncs to Google Sheets, 5) Inventory is updated automatically, 6) Invoice is generated and sent to customer, 7) Payment link is sent (if prepaid).",
  },
];

export default function OrderAutomationPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateFaqSchemaForPAA(FAQ_QUESTIONS)) }} />
      <main className="max-w-7xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/features" className="hover:text-gray-700">Features</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Order Automation</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
          Order Automation — Capture Orders 24/7 via WhatsApp
        </h1>

        <p className="text-xl text-gray-600 mb-8 max-w-3xl">
          Automate order booking via WhatsApp. Customers place orders in chat, AI confirms details,
          you get notifications. 24/7 order capture without hiring support staff.
        </p>

        <div className="flex flex-wrap gap-4 mb-16">
          <Link href="/signup" className="px-8 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">Start Free</Link>
        </div>

        <section className="mb-20">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="text-3xl mb-4">🤖</div>
              <h3 className="text-lg font-semibold mb-2">AI Order Capture</h3>
              <p className="text-gray-600">Chatbot guides customers through order process, captures details, confirms availability.</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="text-3xl mb-4">📊</div>
              <h3 className="text-lg font-semibold mb-2">Dashboard Notifications</h3>
              <p className="text-gray-600">Receive instant notifications for new orders. Manage all orders from one dashboard.</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="text-3xl mb-4">🔄</div>
              <h3 className="text-lg font-semibold mb-2">Google Sheets Sync</h3>
              <p className="text-gray-600">Every order syncs to Google Sheets automatically. No manual data entry.</p>
            </div>
          </div>
        </section>

        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="p-4">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">1</div>
              <h3 className="font-semibold mb-2">Customer Browses</h3>
              <p className="text-gray-600 text-sm">Customer views your product catalog in WhatsApp.</p>
            </div>
            <div className="p-4">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">2</div>
              <h3 className="font-semibold mb-2">AI Guides Order</h3>
              <p className="text-gray-600 text-sm">Chatbot helps select products, quantity, size, color, shipping address.</p>
            </div>
            <div className="p-4">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">3</div>
              <h3 className="font-semibold mb-2">Order Confirmed</h3>
              <p className="text-gray-600 text-sm">Customer receives confirmation. You get notification in dashboard.</p>
            </div>
            <div className="p-4">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">4</div>
              <h3 className="font-semibold mb-2">Invoice Sent</h3>
              <p className="text-gray-600 text-sm">PDF invoice generated and sent via WhatsApp automatically.</p>
            </div>
          </div>
        </section>

        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">FAQs</h2>
          <div className="space-y-4">
            {FAQ_QUESTIONS.map((faq, i) => (
              <details key={i} className="group border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between cursor-pointer p-4 font-semibold text-gray-900">{faq.question}<span className="text-green-600 text-2xl group-open:rotate-180">▼</span></summary>
                <div className="p-4 pt-0 text-gray-600"><p>{faq.answer}</p></div>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-green-600 text-white rounded-lg p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Automate Order Booking Today</h2>
          <p className="mb-8 text-green-100">Free plan includes order automation. No hiring needed.</p>
          <Link href="/signup" className="inline-block px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50">Start Free</Link>
        </section>

        <section className="mt-20">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Related Features</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Link href="/features/whatsapp-store" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500"><h3 className="font-semibold mb-2">WhatsApp Store</h3><p className="text-gray-600 text-sm">Create your store with order automation.</p></Link>
            <Link href="/features/invoice-automation" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500"><h3 className="font-semibold mb-2">Invoice Automation</h3><p className="text-gray-600 text-sm">Send PDF invoices automatically.</p></Link>
            <Link href="/features/ai-chatbot" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500"><h3 className="font-semibold mb-2">AI Chatbot</h3><p className="text-gray-600 text-sm">AI that handles customer queries.</p></Link>
          </div>
        </section>
      </main>
    </>
  );
}