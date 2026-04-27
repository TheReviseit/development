import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Flowauxi vs Wix - Free Website Builder Comparison | Flowauxi",
  description: "Compare Flowauxi vs Wix for e-commerce. See why Flowauxi's WhatsApp-native platform with AI chatbot and zero transaction fees is better for small businesses.",
  keywords: ["Flowauxi vs Wix", "Wix alternatives", "free website builder", "Wix comparison", "best store builder India"],
  alternates: { canonical: "https://www.flowauxi.com/compare/wix" },
};

const FAQ_QUESTIONS = [
  { question: "Is Flowauxi better than Wix for Indian businesses?", answer: "Yes, Flowauxi is built India-first. It includes native Razorpay/UPI integrations, WhatsApp order tracking, and GST invoicing out of the box. Wix requires paid third-party apps for these Indian commerce essentials." },
  { question: "Does Wix have a free plan like Flowauxi?", answer: "Wix has a free plan, but it forces Wix ads on your website and doesn't allow custom domains or online payments. Flowauxi's free plan allows you to start selling immediately without disruptive ads." },
  { question: "Can I sell on WhatsApp with Wix?", answer: "Wix doesn't have native WhatsApp commerce built-in. You have to route customers to your website. Flowauxi lets customers browse, add to cart, and checkout directly within WhatsApp." },
];

export default function CompareWixPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateFaqSchemaForPAA(FAQ_QUESTIONS)) }} />
      <main className="max-w-7xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link><span className="mx-2">/</span><Link href="/compare" className="hover:text-gray-700">Compare</Link><span className="mx-2">/</span><span className="text-gray-900">Flowauxi vs Wix</span>
        </nav>

        <h1 className="text-4xl font-bold mb-6">Flowauxi vs Wix — Best E-commerce Platform</h1>
        <p className="text-xl text-gray-600 mb-8">Wix is a great website builder, but Flowauxi is a dedicated WhatsApp commerce engine. Compare features, pricing, and capabilities.</p>

        <section className="mb-16">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200">
              <thead><tr className="bg-gray-100">
                <th className="text-left p-4 border font-semibold">Feature</th>
                <th className="text-center p-4 border font-semibold text-green-600">Flowauxi</th>
                <th className="text-center p-4 border font-semibold">Wix</th>
              </tr></thead>
              <tbody>
                <tr><td className="p-4 border">True Free E-commerce</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Yes</td><td className="p-4 border text-center text-red-500">✗ No (Requires Paid Plan)</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">WhatsApp Native Checkout</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Included</td><td className="p-4 border text-center text-red-500">✗ Not native</td></tr>
                <tr><td className="p-4 border">AI Customer Support Bot</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Free</td><td className="p-4 border text-center text-red-500">✗ Paid App Required</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">Automated GST Invoicing</td><td className="p-4 border text-center text-green-600 font-semibold">✓ Included</td><td className="p-4 border text-center text-red-500">✗ Third-party App</td></tr>
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
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You want to sell directly on WhatsApp</li>
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You need built-in AI customer support</li>
                <li className="flex items-start gap-2"><span className="text-green-600">✓</span> You want a true free tier without platform ads</li>
              </ul>
              <Link href="/signup" className="mt-6 inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700">Start Free with Flowauxi</Link>
            </div>
            <div className="border border-gray-200 p-6 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Choose Wix If:</h3>
              <ul className="space-y-2">
                <li className="flex items-start gap-2"><span className="text-blue-600">✓</span> You are building a blog or portfolio</li>
                <li className="flex items-start gap-2"><span className="text-blue-600">✓</span> You want complex drag-and-drop animations</li>
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
      </main>
    </>
  );
}
