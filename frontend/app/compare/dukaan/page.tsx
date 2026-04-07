import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

export const metadata: Metadata = {
  title: "Flowauxi vs Dukaan - Free WhatsApp Store Builder Comparison | Flowauxi",
  description: "Compare Flowauxi vs Dukaan for WhatsApp commerce. AI chatbot included free, invoice automation, order tracking. Save ₹12,000/year with Flowauxi.",
  keywords: ["Flowauxi vs Dukaan", "Dukaan alternatives", "free WhatsApp store", "Dukaan comparison", "best store builder India"],
  alternates: { canonical: "https://www.flowauxi.com/compare/dukaan" },
};

const FAQ_QUESTIONS = [
  { question: "Is Flowauxi better than Dukaan for WhatsApp selling?", answer: "For WhatsApp-first selling, Flowauxi is better. Flowauxi has AI chatbot included (Dukaan charges extra), invoice automation built-in (Dukaan addon), order tracking via WhatsApp (Dukaan not available), and Google Sheets sync (Dukaan not available). Flowauxi gives you a free website and 7-day free trial. Dukaan's ₹99/month plan has limitations." },
  { question: "What's the difference between Flowauxi and Dukaan pricing?", answer: "Flowauxi gives you a free website when you create an account, plus a 7-day free trial. Plans start at ₹1,999/month. Dukaan has a ₹99/month basic plan but charges extra for chatbot, invoice automation, and other features. For feature-equivalent plans, Flowauxi offers better value with AI chatbot, order tracking, and invoice automation included." },
  { question: "Can I migrate from Dukaan to Flowauxi?", answer: "Yes, you can migrate from Dukaan to Flowauxi. Export your product catalog from Dukaan, import to Flowauxi, connect WhatsApp, and configure payments. The migration typically takes under an hour. Flowauxi support can assist with the process." },
  { question: "Does Dukaan have WhatsApp chatbot?", answer: "Dukaan does not have a built-in AI chatbot. You would need to use a third-party WhatsApp chatbot service and integrate it separately. Flowauxi includes AI chatbot free with every plan, trained on your product catalog." },
];

export default function CompareDukaanPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateFaqSchemaForPAA(FAQ_QUESTIONS)) }} />
      <main className="max-w-7xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link><span className="mx-2">/</span><Link href="/compare" className="hover:text-gray-700">Compare</Link><span className="mx-2">/</span><span className="text-gray-900">Flowauxi vs Dukaan</span>
        </nav>

        <h1 className="text-4xl font-bold mb-6">Flowauxi vs Dukaan — Free WhatsApp Store Builder</h1>
        <p className="text-xl text-gray-600 mb-8">Compare Flowauxi vs Dukaan for WhatsApp commerce in India. Both have free plans, but Flowauxi includes AI chatbot, invoice automation, and order tracking at no extra cost.</p>

        <section className="mb-16">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr className="bg-gray-100">
                <th className="text-left p-4 border font-semibold">Feature</th>
                <th className="text-center p-4 border font-semibold text-green-600">Flowauxi</th>
                <th className="text-center p-4 border font-semibold">Dukaan</th>
              </tr></thead>
              <tbody>
                <tr><td className="p-4 border">Free Plan</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Forever Free</td><td className="p-4 border text-center">✓ Limited</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">AI Chatbot</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Included Free</td><td className="p-4 border text-center text-red-500">✗ Paid Addon</td></tr>
                <tr><td className="p-4 border">Invoice Automation</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td><td className="p-4 border text-center text-red-500">✗ Paid Addon</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">Order Tracking</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Via WhatsApp</td><td className="p-4 border text-center text-red-500">✗</td></tr>
                <tr><td className="p-4 border">Google Sheets Sync</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td><td className="p-4 border text-center text-red-500">✗</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">Payment Integration</td><td className="p-4 border text-center text-green-600 font-semibold">Razorpay, UPI</td><td className="p-4 border text-center">Razorpay</td></tr>
                <tr><td className="p-4 border font-semibold">Annual Cost (with all features)</td><td className="p-4 border text-center text-green-600 font-semibold text-lg">Free - ₹9,588</td><td className="p-4 border text-center text-lg">₹12,000-18,000</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">When to Choose Each Platform</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="border border-green-200 p-6 rounded-lg bg-green-50">
              <h3 className="text-xl font-semibold text-green-800 mb-4">Choose Flowauxi If:</h3>
              <ul className="space-y-2">
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You need AI chatbot for customer support</li>
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You want invoice automation included</li>
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You sell primarily on WhatsApp</li>
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You want Google Sheets sync</li>
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You run a small business in India</li>
              </ul>
              <Link href="/signup" className="mt-6 inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700">Start Free with Flowauxi</Link>
            </div>
            <div className="border border-gray-200 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Choose Dukaan If:</h3>
              <ul className="space-y-2">
                <li className="flex items-start gap-2"><span className="text-blue-600">✓</span> You need a standalone website</li>
                <li className="flex items-start gap-2"><span className="text-blue-600">✓</span> You already have WhatsApp chatbot elsewhere</li>
                <li className="flex items-start gap-2"><span className="text-blue-600">✓</span> You don't need invoice automation</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mb-16">
          <h2 className="text-2xl font-bold mb-6">FAQs</h2>
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
          <h2 className="text-3xl font-bold mb-4">Save ₹12,000/year with Flowauxi</h2>
          <p className="mb-8 text-green-100">AI chatbot included free. Invoice automation included. Order tracking included.</p>
          <Link href="/signup" className="px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50">Start Free</Link>
        </section>
      </main>
    </>
  );
}