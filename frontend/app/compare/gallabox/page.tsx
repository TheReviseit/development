import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Flowauxi vs Gallabox - WhatsApp CRM Comparison",
  description: "Compare Flowauxi vs Gallabox. Determine which conversational commerce platform is right for your business.",
  keywords: ["Flowauxi vs Gallabox", "Gallabox alternative", "WhatsApp CRM", "conversational commerce platform"],
  alternates: { canonical: "https://www.flowauxi.com/compare/gallabox" },
};

const FAQ_QUESTIONS = [
  { question: "What is the difference between Gallabox and Flowauxi?", answer: "Gallabox serves mid-market to enterprise companies focusing heavily on chat workflows. Flowauxi marries small-business e-commerce (store builders, catalog, checkout) directly with WhatsApp chatbots in one accessible platform." },
  { question: "Is Flowauxi cheaper than Gallabox?", answer: "Yes, Flowauxi is much more accessible for SMBs. We offer a completely free plan, whereas Gallabox subscriptions start at a much higher enterprise price point." },
];

export default function CompareGallaboxPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateFaqSchemaForPAA(FAQ_QUESTIONS)) }} />
      <main className="max-w-7xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link><span className="mx-2">/</span><Link href="/compare" className="hover:text-gray-700">Compare</Link><span className="mx-2">/</span><span className="text-gray-900">Flowauxi vs Gallabox</span>
        </nav>

        <h1 className="text-4xl font-bold mb-6">Flowauxi vs Gallabox</h1>
        <p className="text-xl text-gray-600 mb-8">Choosing the right conversational commerce platform.</p>

        <section className="mb-16">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200">
              <thead><tr className="bg-gray-100">
                <th className="text-left p-4 border font-semibold">Feature</th>
                <th className="text-center p-4 border font-semibold text-green-600">Flowauxi</th>
                <th className="text-center p-4 border font-semibold">Gallabox</th>
              </tr></thead>
              <tbody>
                <tr><td className="p-4 border">Target Audience</td><td className="p-4 border text-center text-green-600 font-semibold">SMBs / Creators</td><td className="p-4 border text-center">Mid-Market / B2B</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">Free Plan</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Yes</td><td className="p-4 border text-center text-red-500">✗ No</td></tr>
                <tr><td className="p-4 border">Turnkey E-commerce</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td><td className="p-4 border text-center text-red-500">✗ No</td></tr>
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
