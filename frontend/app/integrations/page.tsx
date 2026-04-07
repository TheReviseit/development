import type { Metadata } from "next";
import Link from "next/link";
import { INTEGRATIONS } from "@/lib/seo/programmatic";

export const metadata: Metadata = {
  title: "Integrations | Connect Payment, Analytics & More to WhatsApp Store",
  description: "Connect Razorpay, Google Sheets, Paytm, PhonePe, and more to your Flowauxi WhatsApp store. All integrations free on all plans.",
  keywords: [
    "Flowauxi integrations",
    "Razorpay integration",
    "Google Sheets sync",
    "Paytm integration",
    "UPI integration",
    "WhatsApp payment integration",
  ],
  openGraph: {
    title: "Flowauxi Integrations | Connect Your Tools",
    description: "Connect Razorpay, Google Sheets, Paytm, and more to your WhatsApp store.",
    url: "https://www.flowauxi.com/integrations",
    type: "website",
  },
  alternates: { canonical: "https://www.flowauxi.com/integrations" },
};

export default function IntegrationsIndexPage() {
  const paymentIntegrations = INTEGRATIONS.filter((i) => i.type === "payment");
  const analyticsIntegrations = INTEGRATIONS.filter((i) => i.type === "analytics" || i.type === "other");

  return (
    <main className="max-w-6xl mx-auto px-4 py-16">
      <nav className="text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Integrations</span>
      </nav>

      <header className="mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          Integrations
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl">
          Connect payment gateways, analytics tools, and more to your Flowauxi WhatsApp store. All integrations are free on all plans.
        </p>
      </header>

      {/* Payment Integrations */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Payment Gateways</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {paymentIntegrations.map((integration) => (
            <Link
              key={integration.slug}
              href={`/integrations/${integration.slug}`}
              className="border border-gray-200 rounded-lg p-6 hover:border-green-500 hover:shadow-lg transition-all"
            >
              <span className="text-xs font-semibold text-green-600 uppercase tracking-wider">
                {integration.type}
              </span>
              <h3 className="text-lg font-semibold text-gray-900 mt-1">{integration.name}</h3>
              <p className="text-sm text-gray-600 mt-2">
                {integration.features.slice(0, 3).join(", ")}
              </p>
              <div className="mt-4 flex flex-wrap gap-1">
                {integration.features.slice(0, 3).map((feature) => (
                  <span key={feature} className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {feature}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Analytics & Other Integrations */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Analytics & Tools</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {analyticsIntegrations.map((integration) => (
            <Link
              key={integration.slug}
              href={`/integrations/${integration.slug}`}
              className="border border-gray-200 rounded-lg p-6 hover:border-green-500 hover:shadow-lg transition-all"
            >
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                {integration.type === "analytics" ? "analytics" : "integration"}
              </span>
              <h3 className="text-lg font-semibold text-gray-900 mt-1">{integration.name}</h3>
              <p className="text-sm text-gray-600 mt-2">
                {integration.features.slice(0, 3).join(", ")}
              </p>
              <div className="mt-4 flex flex-wrap gap-1">
                {integration.features.slice(0, 3).map((feature) => (
                  <span key={feature} className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {feature}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-green-50 rounded-lg p-8 mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Why Integrate?</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Automatic Sync</h3>
            <p className="text-sm text-gray-600">
              Data syncs automatically between your tools and Flowauxi. No manual work needed.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Free on All Plans</h3>
            <p className="text-sm text-gray-600">
              All integrations are included in every plan. No premium upsells.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">5-Minute Setup</h3>
            <p className="text-sm text-gray-600">
              Connect your accounts in under 5 minutes with our guided setup.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-green-600 text-white rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">Ready to Connect Your Tools?</h2>
        <p className="mb-6 text-green-100">
          Create your Flowauxi account and connect integrations in minutes.
        </p>
        <Link href="/signup" className="px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50 inline-block">
          Start Free Today
        </Link>
      </section>
    </main>
  );
}