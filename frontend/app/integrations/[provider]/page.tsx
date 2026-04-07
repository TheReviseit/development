import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { INTEGRATIONS, type IntegrationData } from "@/lib/seo/programmatic";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

interface Props {
  params: Promise<{ provider: string }>;
}

export async function generateStaticParams() {
  return INTEGRATIONS.filter((integration) => integration.dataQualityScore && integration.dataQualityScore >= 70).map((integration) => ({
    provider: integration.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { provider: providerSlug } = await params;
  const integration = INTEGRATIONS.find((i) => i.slug === providerSlug);
  if (!integration) return { title: "Integration Not Found" };

  const title = `${integration.name} Integration | Connect to WhatsApp Store`;
  const description = `Connect ${integration.provider} to your Flowauxi WhatsApp store. ${integration.features.slice(0, 3).join(", ")}. Setup in 5 minutes.`;

  return {
    title,
    description,
    keywords: [
      `${integration.name.toLowerCase()}`,
      `${integration.provider.toLowerCase()} integration`,
      `${integration.provider.toLowerCase()} whatsapp`,
      `flowauxi ${integration.provider.toLowerCase()}`,
      ...integration.features.map((f) => f.toLowerCase()),
    ],
    openGraph: {
      title,
      description,
      url: `https://www.flowauxi.com/integrations/${integration.slug}`,
      type: "website",
    },
    alternates: { canonical: `https://www.flowauxi.com/integrations/${integration.slug}` },
  };
}

const FAQ_TEMPLATE = (integration: IntegrationData) => [
  {
    question: `How do I integrate ${integration.provider} with Flowauxi?`,
    answer: `To integrate ${integration.provider} with Flowauxi: 1) Go to Settings > Integrations in your Flowauxi dashboard, 2) Click "Connect ${integration.provider}", 3) Authorize the connection with your ${integration.provider} account, 4) Configure settings like auto-sync and notifications. ${integration.setupTime ? `Setup takes ${integration.setupTime}.` : "Setup takes less than 5 minutes."} The integration works automatically after setup.`,
  },
  {
    question: `What features does ${integration.name} provide?`,
    answer: `${integration.name} provides: ${integration.features.join(", ")}. ${integration.type === "payment" ? "Payment links are automatically generated and sent to customers via WhatsApp when orders are placed." : integration.type === "analytics" ? "Data is synced in real-time and available in your Flowauxi dashboard." : "All features are included in your Flowauxi plan."}`,
  },
  {
    question: `Is ${integration.name} included in Flowauxi pricing?`,
    answer: `Yes, ${integration.name} is included in all Flowauxi plans including the free plan. There are no additional charges for integrations. ${integration.type === "payment" ? "Payment gateway fees (e.g., Razorpay's 2%) are charged by the payment provider, not Flowauxi." : "You only pay your Flowauxi subscription."}`,
  },
];

export default async function IntegrationPage({ params }: Props) {
  const { provider: providerSlug } = await params;
  const integration = INTEGRATIONS.find((i) => i.slug === providerSlug);
  if (!integration) notFound();

  const faqQuestions = FAQ_TEMPLATE(integration);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateFaqSchemaForPAA(faqQuestions)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `${integration.name} Integration`,
        description: `Connect ${integration.provider} to your Flowauxi WhatsApp store`,
        about: {
          "@type": "SoftwareApplication",
          name: integration.name,
          applicationCategory: integration.type === "payment" ? "FinanceApplication" : "BusinessApplication",
        },
      }) }} />

      <main className="max-w-4xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/integrations" className="hover:text-gray-700">Integrations</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{integration.name}</span>
        </nav>

        <header className="mb-12">
          <div className="flex items-center gap-4 mb-4">
            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium uppercase">
              {integration.type}
            </span>
            {integration.setupTime && (
              <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-sm">
                {integration.setupTime} setup
              </span>
            )}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            {integration.name}
          </h1>
          <p className="text-xl text-gray-600">
            Connect {integration.provider} to your Flowauxi WhatsApp store. {integration.features.slice(0, 2).join(", ")}.
          </p>
        </header>

        <div className="bg-green-50 border-l-4 border-green-500 p-6 mb-12">
          <h2 className="font-bold text-green-800 mb-2">Integration Highlights</h2>
          <ul className="space-y-1 text-gray-700">
            {integration.features.map((feature) => (
              <li key={feature}>✓ {feature}</li>
            ))}
            <li>✓ Free on all plans</li>
            <li>✓ 5-minute setup</li>
            <li>✓ Automatic sync</li>
          </ul>
          <Link href="/signup" className="mt-4 inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700">
            Connect {integration.provider}
          </Link>
        </div>

        <div className="prose prose-lg max-w-none">
          <h2 id="features">Features</h2>
          <p>{integration.name} integration provides the following features:</p>
          <ul>
            {integration.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>

          <h2 id="how-it-works">How It Works</h2>
          <ol>
            <li><strong>Connect:</strong> Authorize the connection from your Flowauxi dashboard. Takes 2 minutes.</li>
            <li><strong>Configure:</strong> Set up sync preferences, notification settings, and automation rules.</li>
            <li><strong>Sync:</strong> Data flows automatically between {integration.provider} and your WhatsApp store.</li>
          </ol>

          <h2 id="pricing">Pricing</h2>
          <p>
            {integration.name} integration is included in all Flowauxi plans including the free plan.
            {integration.type === "payment" 
              ? ` Payment gateway fees are charged by ${integration.provider} (typically 2% per transaction). Flowauxi does not add any fees.`
              : " There are no additional charges for using this integration."
            }
          </p>

          <h2 id="setup">Setup Guide</h2>
          <p>Setting up {integration.name} takes less than 5minutes:</p>
          <ol>
            <li>Log in to your Flowauxi dashboard</li>
            <li>Go to Settings &gt; Integrations</li>
            <li>Click &quot;Connect {integration.provider}&quot;</li>
            <li>Authorize with your {integration.provider} account</li>
            <li>Configure sync preferences</li>
            <li>Save and start using</li>
          </ol>
        </div>

        <section className="mt-16">
          <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqQuestions.map((faq, i) => (
              <details key={i} className="group border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between cursor-pointer p-4 font-semibold text-gray-900">
                  {faq.question}
                  <span className="text-green-600 text-2xl group-open:rotate-180">▼</span>
                </summary>
                <div className="p-4 pt-0 text-gray-600"><p>{faq.answer}</p></div>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-16 bg-green-600 text-white rounded-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Connect {integration.provider} Today</h2>
          <p className="mb-6 text-green-100">
            Free integration on all plans. Setup in 5 minutes.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/signup" className="px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50">
              Start Free Today
            </Link>
            <Link href="/integrations" className="px-8 py-4 border-2 border-white rounded-lg font-semibold hover:bg-green-700">
              See All Integrations
            </Link>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-xl font-bold mb-4">Other Integrations</h2>
          <div className="flex flex-wrap gap-2">
            {INTEGRATIONS.filter((i) => i.slug !== integration.slug).map((otherIntegration) => (
              <Link
                key={otherIntegration.slug}
                href={`/integrations/${otherIntegration.slug}`}
                className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-full text-sm text-gray-700"
              >
                {otherIntegration.name}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}