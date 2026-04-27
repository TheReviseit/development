import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Flowauxi vs MyAlice - Omnichannel & WhatsApp Selling",
  description: "Compare Flowauxi vs MyAlice. Discover the best platform for your growing e-commerce brand.",
  keywords: ["Flowauxi vs MyAlice", "MyAlice alternative", "social commerce", "WhatsApp storefront"],
  alternates: { canonical: "https://www.flowauxi.com/compare/myalice" },
};

const FAQ_QUESTIONS = [
  { question: "Which is better for small businesses: Flowauxi or MyAlice?", answer: "If you want a unified inbox for Facebook, Instagram, and WhatsApp, MyAlice is strong. If you want to build an actual online store that connects natively with WhatsApp to drive direct sales automatically, Flowauxi is the superior choice." },
  { question: "Does MyAlice provide a website builder?", answer: "No, MyAlice is primarily a social ticketing and messaging platform. Flowauxi gives you both the AI automation AND the website builder for a complete business suite." },
];

export default function CompareMyAlicePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateFaqSchemaForPAA(FAQ_QUESTIONS)) }} />
      <main className="max-w-7xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link><span className="mx-2">/</span><Link href="/compare" className="hover:text-gray-700">Compare</Link><span className="mx-2">/</span><span className="text-gray-900">Flowauxi vs MyAlice</span>
        </nav>

        <h1 className="text-4xl font-bold mb-6">Flowauxi vs MyAlice</h1>
        <p className="text-xl text-gray-600 mb-8">E-commerce store builder vs Multichannel inbox.</p>

        <section className="mb-16">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200">
              <thead><tr className="bg-gray-100">
                <th className="text-left p-4 border font-semibold">Feature</th>
                <th className="text-center p-4 border font-semibold text-green-600">Flowauxi</th>
                <th className="text-center p-4 border font-semibold">MyAlice</th>
              </tr></thead>
              <tbody>
                <tr><td className="p-4 border">Website Builder included</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Yes</td><td className="p-4 border text-center text-red-500">✗ No</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">WhatsApp Checkout</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Yes</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Yes</td></tr>
                <tr><td className="p-4 border">Multi-channel Inbox</td><td className="p-4 border text-center text-yellow-600 font-semibold">~ WhatsApp primary</td><td className="p-4 border text-center text-green-600 font-semibold">✓ FB, IG, WA</td></tr>
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
