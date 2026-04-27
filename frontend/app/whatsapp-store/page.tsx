import type { Metadata } from "next";
import Link from "next/link";
import { INDIA_CITIES } from "@/lib/seo/programmatic";

export const metadata: Metadata = {
  title: "WhatsApp Store Builder | Create Your Free WhatsApp Store",
  description: "Create a free WhatsApp store in 10 minutes. AI chatbot, order management, payment integration included. Businesses across India use Flowauxi.",
  keywords: [
    "WhatsApp store builder",
    "create WhatsApp store",
    "free WhatsApp store",
    "WhatsApp online store",
    "WhatsApp shop builder",
    "WhatsApp Business store",
  ],
  openGraph: {
    title: "WhatsApp Store Builder | Create Your Free WhatsApp Store",
    description: "Create a free WhatsApp store in 10 minutes. AI chatbot included.",
    url: "https://www.flowauxi.com/whatsapp-store",
    type: "website",
  },
  alternates: { canonical: "https://www.flowauxi.com/whatsapp-store" },
};

export default function WhatsAppStoreIndexPage() {
  const tier1Cities = INDIA_CITIES.filter((c) => c.tier === "tier-1").slice(0, 8);
  const tier2Cities = INDIA_CITIES.filter((c) => c.tier === "tier-2").slice(0, 8);

  return (
    <main className="max-w-6xl mx-auto px-4 py-16">
      <header className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
          WhatsApp Store Builder
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
          Create your free WhatsApp store in 10 minutes. AI chatbot, order management, and payment integration included. Join businesses across India selling on WhatsApp.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link href="/signup" className="px-8 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">
            Create Free WhatsApp Store
          </Link>
          <Link href="/features/whatsapp-store" className="px-8 py-4 border-2 border-green-600 text-green-600 rounded-lg font-semibold hover:bg-green-50">
            See All Features
          </Link>
        </div>
      </header>

      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">WhatsApp Store by City</h2>
        <p className="text-gray-600 mb-8">
          Flowauxi serves businesses across India. Select your city to see city-specific information, popular product categories, and local courier partners.
        </p>

        <h3 className="text-lg font-semibold text-gray-800 mb-4">Tier 1 Cities</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {tier1Cities.map((city) => (
            <Link
              key={city.slug}
              href={`/whatsapp-store/${city.slug}`}
              className="border border-gray-200 rounded-lg p-4 hover:border-green-500 hover:bg-green-50 transition-colors"
            >
              <h4 className="font-semibold text-gray-900">{city.name}</h4>
              <p className="text-sm text-gray-500">{city.state}</p>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full mt-2 inline-block">
                {city.tier.replace("-", " ").toUpperCase()}
              </span>
            </Link>
          ))}
        </div>

        <h3 className="text-lg font-semibold text-gray-800 mb-4">Tier 2 Cities</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {tier2Cities.map((city) => (
            <Link
              key={city.slug}
              href={`/whatsapp-store/${city.slug}`}
              className="border border-gray-200 rounded-lg p-4 hover:border-green-500 hover:bg-green-50 transition-colors"
            >
              <h4 className="font-semibold text-gray-900">{city.name}</h4>
              <p className="text-sm text-gray-500">{city.state}</p>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full mt-2 inline-block">
                {city.tier.replace("-", " ").toUpperCase()}
              </span>
            </Link>
          ))}
        </div>

        <Link href="/whatsapp-store/mumbai" className="text-green-600 hover:underline">
          View all cities →
        </Link>
      </section>

      <section className="bg-green-50 rounded-lg p-8 mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Why Create a WhatsApp Store?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">500+ Million Users</h3>
            <p className="text-gray-600">
              WhatsApp is the most-used app in India. Your customers are already there.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">3-5x Higher Conversion</h3>
            <p className="text-gray-600">
              Chat-based selling converts higher than websites. Customers can ask questions before buying.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Zero Monthly Cost</h3>
            <p className="text-gray-600">
              Start free with AI chatbot, order management, and payments included.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">City Pages</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {INDIA_CITIES.slice(0, 15).map((city) => (
            <Link
              key={city.slug}
              href={`/whatsapp-store/${city.slug}`}
              className="text-green-600 hover:underline"
            >
              WhatsApp Store in {city.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-gray-100 rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to Start?</h2>
        <p className="text-gray-600 mb-6">
          Create your WhatsApp store in under 10 minutes. No credit card required.
        </p>
        <Link href="/signup" className="px-8 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 inline-block">
          Create Free Store
        </Link>
      </section>
    </main>
  );
}