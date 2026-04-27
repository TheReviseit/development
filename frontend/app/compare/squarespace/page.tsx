import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Flowauxi vs Squarespace - Ecommerce Platform Comparison",
  description: "Compare Flowauxi vs Squarespace. See why Flowauxi's free WhatsApp selling platform is better for conversion than traditional website builders.",
  keywords: ["Flowauxi vs Squarespace", "Squarespace alternatives", "ecommerce builder", "Squarespace comparison"],
  alternates: { canonical: "https://www.flowauxi.com/compare/squarespace" },
};

const FAQ_QUESTIONS = [
  { question: "Is Flowauxi better than Squarespace for ecommerce?", answer: "Squarespace is excellent for service businesses and portfolios. However, if your customers prefer ordering via WhatsApp, Flowauxi creates a frictionless buying experience that Squarespace cannot match." },
  { question: "How does pricing compare between Flowauxi and Squarespace?", answer: "Squarespace commerce plans start around ₹2,000/month. Flowauxi offers a robust completely free tier and our premium features start at ₹1,999/month, which includes an AI Chatbot that Squarespace lacks." },
];

export default function CompareSquarespacePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateFaqSchemaForPAA(FAQ_QUESTIONS)) }} />
      <main className="max-w-7xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link><span className="mx-2">/</span><Link href="/compare" className="hover:text-gray-700">Compare</Link><span className="mx-2">/</span><span className="text-gray-900">Flowauxi vs Squarespace</span>
        </nav>

        <h1 className="text-4xl font-bold mb-6">Flowauxi vs Squarespace</h1>
        <p className="text-xl text-gray-600 mb-8">Compare traditional aesthetics with modern conversational commerce.</p>

        <section className="mb-16">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200">
              <thead><tr className="bg-gray-100">
                <th className="text-left p-4 border font-semibold">Feature</th>
                <th className="text-center p-4 border font-semibold text-green-600">Flowauxi</th>
                <th className="text-center p-4 border font-semibold">Squarespace</th>
              </tr></thead>
              <tbody>
                <tr><td className="p-4 border">WhatsApp Storefront</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Yes</td><td className="p-4 border text-center text-red-500">✗ No</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">Free Lifetime Plan</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Included</td><td className="p-4 border text-center text-red-500">✗ 14-day trial only</td></tr>
                <tr><td className="p-4 border">AI Chatbot</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td><td className="p-4 border text-center text-red-500">✗ No</td></tr>
              </tbody>
            </table>
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
      </main>
    </>
  );
}
