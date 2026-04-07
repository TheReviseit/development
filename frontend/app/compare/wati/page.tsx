import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

export const metadata: Metadata = {
  title: "Flowauxi vs Wati - WhatsApp Chatbot Comparison (Free AI Included) | Flowauxi",
  description: "Compare Flowauxi vs Wati for WhatsApp chatbot. Flowauxi includes AI chatbot free + store builder. Wati charges for chatbot only. Save ₹6,000/year.",
  keywords: ["Flowauxi vs Wati", "Wati comparison", "WhatsApp chatbot comparison", "best WhatsApp chatbot India", "free WhatsApp chatbot"],
  alternates: { canonical: "https://www.flowauxi.com/compare/wati" },
};

const FAQ_QUESTIONS = [
  { question: "Is Flowauxi better than Wati for WhatsApp chatbot?", answer: "Flowauxi is better than Wati if you need more than just a chatbot. Flowauxi includes: AI chatbot, WhatsApp store builder, order automation, invoice delivery, payment integration — all in one platform. Wati only provides WhatsApp Business API and chatbot — no store builder, no e-commerce features. Flowauxi gives you a free website and 7-day free trial, while Wati starts at ₹999/month." },
  { question: "What's the difference between Flowauxi and Wati pricing?", answer: "Flowauxi gives you a free website when you sign up, plus a 7-day free trial. Plans start at ₹1,999/month and include store builder, order management, and invoice delivery. Wati's cheapest plan is ₹999/month for just WhatsApp API + chatbot — no store, no orders, no invoices. For complete WhatsApp commerce features, Flowauxi offers better value." },
  { question: "Does Wati have an online store builder?", answer: "No, Wati does not have an online store builder. Wati is purely a WhatsApp Business API and chatbot platform. If you want to sell products, you'd need a separate e-commerce platform. Flowauxi includes both: AI chatbot AND store builder in one platform." },
  { question: "Which is better for small businesses in India: Flowauxi or Wati?", answer: "For small businesses in India, Flowauxi is better because: 1) Free forever plan (Wati: ₹999/month), 2) Store builder included (Wati: not available), 3) Order management included (Wati: not available), 4) Invoice delivery included (Wati: not available), 5) Payment integration included (Wati: not available). If you only need WhatsApp API without selling, Wati may be sufficient. For selling on WhatsApp, Flowauxi offers better value." },
  { question: "Can I use both Flowauxi and Wati together?", answer: "No, Flowauxi and Wati cannot be used together as they both connect to the same WhatsApp Business API number. You must choose one platform. If you're already using Wati and want to switch to Flowauxi, you can export your WhatsApp templates and contact lists, then connect to Flowauxi." },
];

export default function CompareWatiPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateFaqSchemaForPAA(FAQ_QUESTIONS)) }} />
      <main className="max-w-7xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link><span className="mx-2">/</span><Link href="/compare" className="hover:text-gray-700">Compare</Link><span className="mx-2">/</span><span className="text-gray-900">Flowauxi vs Wati</span>
        </nav>

        <h1 className="text-4xl font-bold mb-6">Flowauxi vs Wati — WhatsApp Chatbot & Store Comparison</h1>
        <p className="text-xl text-gray-600 mb-8">Compare Flowauxi vs Wati for WhatsApp. Flowauxi includes AI chatbot FREE + store builder. Wati charges for chatbot only. See full feature comparison.</p>

        {/* Quick Verdict */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-12">
          <h2 className="text-xl font-semibold text-green-800 mb-2">Quick Verdict</h2>
          <p className="text-green-700"><strong>Choose Flowauxi if:</strong> You want AI chatbot + store builder + order management in one platform, for free.</p>
          <p className="text-green-700 mt-2"><strong>Choose Wati if:</strong> You only need WhatsApp Business API and chatbot, without e-commerce features.</p>
        </div>

        {/* Comparison Table */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Feature Comparison</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr className="bg-gray-100">
                <th className="text-left p-4 border font-semibold">Feature</th>
                <th className="text-center p-4 border font-semibold text-green-600">Flowauxi</th>
                <th className="text-center p-4 border font-semibold">Wati</th>
              </tr></thead>
              <tbody>
                <tr><td className="p-4 border">Free Plan</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Forever Free</td><td className="p-4 border text-center text-red-500">✗</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">AI Chatbot</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Included Free</td><td className="p-4 border text-center">✓ Included</td></tr>
                <tr><td className="p-4 border">Store Builder</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td><td className="p-4 border text-center text-red-500">✗ Not Available</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">Order Management</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td><td className="p-4 border text-center text-red-500">✗ Not Available</td></tr>
                <tr><td className="p-4 border">Invoice Delivery</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Via WhatsApp</td><td className="p-4 border text-center text-red-500">✗ Not Available</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">Payment Integration</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Razorpay, UPI</td><td className="p-4 border text-center text-red-500">✗ Not Available</td></tr>
                <tr><td className="p-4 border">Google Sheets Sync</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td><td className="p-4 border text-center text-red-500">✗ Not Available</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">WhatsApp Business API</td><td className="p-4 border text-center">✓</td><td className="p-4 border text-center">✓</td></tr>
                <tr><td className="p-4 border">Broadcast Messages</td><td className="p-4 border text-center">✓</td><td className="p-4 border text-center">✓</td></tr>
                <tr className="bg-gray-100 font-semibold"><td className="p-4 border">Starting Price</td><td className="p-4 border text-center text-green-600 text-lg">Free Forever</td><td className="p-4 border text-center text-lg">₹999/month</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* When to Choose */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">When to Choose Each Platform</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="border border-green-200 p-6 rounded-lg bg-green-50">
              <h3 className="text-xl font-semibold text-green-800 mb-4">Choose Flowauxi If:</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You want AI chatbot included free</li>
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You need an online store</li>
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You want order management</li>
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You need invoice delivery</li>
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You're a small business in India</li>
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You sell products on WhatsApp</li>
              </ul>
              <Link href="/signup" className="mt-6 inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700">Start Free with Flowauxi</Link>
            </div>
            <div className="border border-gray-200 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Choose Wati If:</h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-2"><span className="text-blue-600">✓</span> You only need WhatsApp Business API</li>
                <li className="flex items-start gap-2"><span className="text-blue-600">✓</span> You don't need an online store</li>
                <li className="flex items-start gap-2"><span className="text-blue-600">✓</span> You have a separate e-commerce platform</li>
                <li className="flex items-start gap-2"><span className="text-blue-600">✓</span> budget allows ₹999/month minimum</li>
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {FAQ_QUESTIONS.map((faq, i) => (
              <details key={i} className="group border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between cursor-pointer p-4 font-semibold text-gray-900">{faq.question}<span className="text-green-600 text-2xl group-open:rotate-180">▼</span></summary>
                <div className="p-4 pt-0 text-gray-600"><p>{faq.answer}</p></div>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-green-600 text-white rounded-lg p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Get AI Chatbot Free — Start Today</h2>
          <p className="mb-8 text-green-100">Flowauxi includes AI chatbot + store builder. Free forever.</p>
          <Link href="/signup" className="px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50">Start Free</Link>
        </section>

        {/* Related */}
        <section className="mt-16">
          <h2 className="text-xl font-bold mb-4">Other Comparisons</h2>
          <div className="flex flex-wrap gap-4">
            <Link href="/compare/shopify" className="text-green-600 hover:underline">Flowauxi vs Shopify</Link>
            <Link href="/compare/dukaan" className="text-green-600 hover:underline">Flowauxi vs Dukaan</Link>
          </div>
        </section>
      </main>
    </>
  );
}