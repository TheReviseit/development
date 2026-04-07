import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { INDUSTRIES, generateIndustryMetaDescription, generateIndustryUniqueContent, type IndustryData } from "@/lib/seo/programmatic";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

interface Props {
  params: Promise<{ industry: string }>;
}

export async function generateStaticParams() {
  return INDUSTRIES.filter((industry) => industry.dataQualityScore && industry.dataQualityScore >= 60).map((industry) => ({
    industry: industry.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { industry: industrySlug } = await params;
  const industry = INDUSTRIES.find((i) => i.slug === industrySlug);
  if (!industry) return { title: "Industry Not Found" };

  const title = `${industry.name} WhatsApp Store Builder | Free E-commerce Platform`;
  const description = generateIndustryMetaDescription(industry);

  return {
    title,
    description,
    keywords: [
      `${industry.name.toLowerCase()} whatsapp store`,
      `${industry.name.toLowerCase()} ecommerce`,
      `sell ${industry.name.toLowerCase()} on whatsapp`,
      `${industry.name.toLowerCase()} D2C`,
      `online ${industry.name.toLowerCase()} store`,
      ...industry.categories.map((c) => c.toLowerCase()),
    ],
    openGraph: {
      title,
      description,
      url: `https://www.flowauxi.com/ecommerce/${industry.slug}`,
      type: "website",
    },
    alternates: { canonical: `https://www.flowauxi.com/ecommerce/${industry.slug}` },
  };
}

const FAQ_TEMPLATE = (industry: IndustryData) => [
  {
    question: `How do I sell ${industry.name.toLowerCase()} products on WhatsApp?`,
    answer: `To sell ${industry.name.toLowerCase()} products on WhatsApp: 1) Create a free Flowauxi account, 2) Upload your ${industry.categories.slice(0, 2).join(" and ")} catalog with images and prices, 3) Connect Razorpay or UPI for payments, 4) Share your store link on Instagram and WhatsApp groups, 5) The AI chatbot handles customer queries 24/7. ${industry.categories.length > 0 ? `Popular categories in ${industry.name} include: ${industry.categories.slice(0, 3).join(", ")}.` : ""}`,
  },
  {
    question: `Is Flowauxi good for ${industry.name.toLowerCase()} businesses?`,
    answer: `Yes, Flowauxi is designed for ${industry.name.toLowerCase()} businesses selling on WhatsApp. ${industry.useCases.length > 0 ? `Key features for ${industry.name} include: ${industry.useCases.slice(0, 2).join(", ")}.` : ""} The platform includes AI chatbot for product queries, order management, invoice delivery via WhatsApp, and payment integration. ${industry.name.toLowerCase()} merchants can start for free and scale as they grow.`,
  },
  {
    question: `What are the best-selling ${industry.name.toLowerCase()} categories?`,
    answer: `${industry.categories.length > 0 ? `Top-selling categories in ${industry.name} are: ${industry.categories.slice(0, 5).join(", ")}. ` : ""}These categories perform well on WhatsApp because customers prefer to ask questions about products before buying. Categories with high customer engagement (fashion, electronics, home decor) see 3-5x higher conversion on WhatsApp compared to websites.`,
  },
];

export default async function IndustryPage({ params }: Props) {
  const { industry: industrySlug } = await params;
  const industry = INDUSTRIES.find((i) => i.slug === industrySlug);
  if (!industry) notFound();

  const faqQuestions = FAQ_TEMPLATE(industry);
  const uniqueContent = generateIndustryUniqueContent(industry);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateFaqSchemaForPAA(faqQuestions)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: `${industry.name} WhatsApp Store Builder`,
        description: uniqueContent,
        about: {
          "@type": "Thing",
          name: industry.name,
        },
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": `https://www.flowauxi.com/ecommerce/${industry.slug}`,
        },
      }) }} />

      <main className="max-w-4xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/ecommerce" className="hover:text-gray-700">E-commerce</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{industry.name}</span>
        </nav>

        <header className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            {industry.name} WhatsApp Store Builder
          </h1>
          <p className="text-xl text-gray-600 mb-6">
            {uniqueContent}
          </p>
          <div className="flex flex-wrap gap-2">
            {industry.categories.slice(0, 5).map((category) => (
              <span key={category} className="bg-gray-100 px-3 py-1 rounded-full text-sm text-gray-700">
                {category}
              </span>
            ))}
          </div>
        </header>

        <div className="bg-green-50 border-l-4 border-green-500 p-6 mb-12">
          <h2 className="font-bold text-green-800 mb-2">Why Sell {industry.name} on WhatsApp?</h2>
          <ul className="space-y-1 text-gray-700">
            <li>• AI chatbot answers product questions 24/7</li>
            <li>• Higher conversion with personalized chat</li>
            <li>• No marketplace fees — keep all profits</li>
            <li>• Direct customer relationships</li>
            <li>• Instant payment via UPI, Razorpay</li>
          </ul>
          <Link href="/signup" className="mt-4 inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700">
            Start Free Today
          </Link>
        </div>

        <div className="prose prose-lg max-w-none">
          <h2 id="categories">{industry.name} Categories</h2>
          <p>Top categories in {industry.name} for WhatsApp e-commerce:</p>
          <div className="grid md:grid-cols-3 gap-4 not-prose">
            {industry.categories.map((category) => (
              <div key={category} className="border border-gray-200 rounded-lg p-4 hover:border-green-500">
                <h3 className="font-semibold text-gray-900">{category}</h3>
              </div>
            ))}
          </div>

          <h2 id="use-cases">How {industry.name} Businesses Use Flowauxi</h2>
          <p>Common use cases for {industry.name.toLowerCase()} merchants:</p>
          <ul>
            {industry.useCases.map((useCase) => (
              <li key={useCase}>{useCase}</li>
            ))}
          </ul>

          <h2 id="features">Features for {industry.name} Businesses</h2>
          <div className="grid md:grid-cols-2 gap-4 not-prose">
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">AI Chatbot</h3>
              <p className="text-sm text-gray-600">
                24/7 chatbot handles product questions, takes orders, and sends payment links automatically.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Order Management</h3>
              <p className="text-sm text-gray-600">
                Track all orders from your {industry.name.toLowerCase()} business in one dashboard.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Payment Collection</h3>
              <p className="text-sm text-gray-600">
                Razorpay, UPI, Paytm integration for fast payments from your customers.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Delivery Tracking</h3>
              <p className="text-sm text-gray-600">
                Send order status updates to customers via WhatsApp automatically.
              </p>
            </div>
          </div>

          <h2 id="get-started">Get Started with {industry.name} WhatsApp Store</h2>
          <p>Setting up your {industry.name.toLowerCase()} WhatsApp store takes less than 10minutes:</p>
          <ol>
            <li>Create a free Flowauxi account</li>
            <li>Upload your {industry.name.toLowerCase()} product catalog</li>
            <li>Connect payment gateway (Razorpay, UPI)</li>
            <li>Share your store link on social media</li>
            <li>Let AI chatbot handle customer queries</li>
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
          <h2 className="text-2xl font-bold mb-4">Start Your {industry.name} WhatsApp Store</h2>
          <p className="mb-6 text-green-100">
            Free AI chatbot, order management, and payments. Join 500+ {industry.name.toLowerCase()} businesses.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/signup" className="px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50">
              Start Free Today
            </Link>
            <Link href="/features/whatsapp-store" className="px-8 py-4 border-2 border-white rounded-lg font-semibold hover:bg-green-700">
              See Features
            </Link>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-xl font-bold mb-4">Other Industries</h2>
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.filter((i) => i.slug !== industry.slug).slice(0, 6).map((otherIndustry) => (
              <Link
                key={otherIndustry.slug}
                href={`/ecommerce/${otherIndustry.slug}`}
                className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-full text-sm text-gray-700"
              >
                {otherIndustry.name}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}