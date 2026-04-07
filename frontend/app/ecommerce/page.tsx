import type { Metadata } from "next";
import Link from "next/link";
import { INDUSTRIES } from "@/lib/seo/programmatic";

export const metadata: Metadata = {
  title: "E-commerce WhatsApp Store by Industry | Free Store Builder",
  description: "Create your WhatsApp store for Fashion, Electronics, Home Decor, Food, Beauty, and more. Industry-specific features for D2C brands in India.",
  keywords: [
    "ecommerce whatsapp store",
    "fashion whatsapp store",
    "electronics whatsapp store",
    "D2C whatsapp India",
    "whatsapp store builder by industry",
  ],
  openGraph: {
    title: "E-commerce WhatsApp Store by Industry",
    description: "Create your WhatsApp store for Fashion, Electronics, Home Decor, and more.",
    url: "https://www.flowauxi.com/ecommerce",
    type: "website",
  },
  alternates: { canonical: "https://www.flowauxi.com/ecommerce" },
};

export default function EcommerceIndexPage() {
  const industries = INDUSTRIES.filter((i) => i.dataQualityScore && i.dataQualityScore >= 60);

  return (
    <main className="max-w-6xl mx-auto px-4 py-16">
      <nav className="text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">E-commerce by Industry</span>
      </nav>

      <header className="mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          E-commerce WhatsApp Store by Industry
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl">
          Create a WhatsApp store tailored for your industry. AI chatbot, order management, and payments built for D2C brands in India.
        </p>
      </header>

      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Browse by Industry</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {industries.map((industry) => (
            <Link
              key={industry.slug}
              href={`/ecommerce/${industry.slug}`}
              className="border border-gray-200 rounded-lg p-6 hover:border-green-500 hover:shadow-lg transition-all"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{industry.name}</h3>
              <p className="text-sm text-gray-600 mb-4">
                {industry.categories.slice(0, 3).join(", ")}
              </p>
              <div className="flex flex-wrap gap-1">
                {industry.categories.slice(0, 4).map((category) => (
                  <span key={category} className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {category}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-green-50 rounded-lg p-8 mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Industry Features</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">AI Chatbot</h3>
            <p className="text-sm text-gray-600">
              Industry-specific chatbot trained to answer product questions and take orders.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Order Management</h3>
            <p className="text-sm text-gray-600">
              Track orders, inventory, and customers in one dashboard.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Payment Integration</h3>
            <p className="text-sm text-gray-600">
              Razorpay, UPI, Paytm integration for instant payments.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-green-600 text-white rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">Ready to Start?</h2>
        <p className="mb-6 text-green-100">
          Create your WhatsApp store in under 10 minutes. No credit card required.
        </p>
        <Link href="/signup" className="px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50 inline-block">
          Create Free Store
        </Link>
      </section>
    </main>
  );
}