import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { INDIA_CITIES, generateCityMetaDescription, generateCityUniqueContent, type CityData } from "@/lib/seo/programmatic";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";
import { generateLocalBusinessSchema } from "@/lib/seo/schema-extensions";
interface Props {
  params: Promise<{ city: string }>;
}

export async function generateStaticParams() {
  return INDIA_CITIES.filter(city => city.dataQualityScore && city.dataQualityScore >= 50).map((city) => ({
    city: city.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: citySlug } = await params;
  const city = INDIA_CITIES.find((c) => c.slug === citySlug);
  if (!city) return { title: "City Not Found" };

  const title = `WhatsApp Store in ${city.name} | Free Online Store Builder`;
  const description = generateCityMetaDescription(city);

  return {
    title,
    description,
    keywords: [
      `WhatsApp store ${city.name}`,
      `online store ${city.name}`,
      `WhatsApp Business ${city.name}`,
      `sell on WhatsApp ${city.name}`,
      `${city.name} ecommerce`,
      `D2C ${city.name}`,
      `WhatsApp shop ${city.name}`,
    ],
    openGraph: {
      title,
      description,
      url: `https://www.flowauxi.com/whatsapp-store/${city.slug}`,
      type: "website",
      images: [{ url: `/og-whatsapp-store-${city.slug}.png`, width: 1200, height: 630 }],
    },
    alternates: { canonical: `https://www.flowauxi.com/whatsapp-store/${city.slug}` },
  };
}

const FAQ_TEMPLATE = (city: CityData) => [
  {
    question: `How do I start a WhatsApp store in ${city.name}?`,
    answer: `To start a WhatsApp store in ${city.name}: 1) Sign up for Flowauxi (free), 2) Upload your product catalog, 3) Connect payment gateway (Razorpay, UPI), 4) Share your store link on social media and WhatsApp groups. Your store is live immediately. Flowauxi handles WhatsApp Business API, AI chatbot, order management, and invoice delivery. ${city.merchantCount ? `Over ${city.merchantCount.toLocaleString()} businesses in ${city.name} use Flowauxi.` : ""}`,
  },
  {
    question: `What are the best-selling products on WhatsApp in ${city.name}?`,
    answer: `${city.topCategories && city.topCategories.length > 0 ? `The most popular categories in ${city.name} are: ${city.topCategories.slice(0, 3).join(", ")}. ` : ""}Fashion, electronics, home decor, and food are top categories across India. In ${city.name}, D2C brands and small businesses use WhatsApp for direct customer relationships. The key is finding products that customers want to ask questions about before buying — these convert well on WhatsApp.`,
  },
  {
    question: `Is WhatsApp Business API available in ${city.name}?`,
    answer: `Yes, WhatsApp Business API is available in ${city.name} and throughout India. When you sign up for Flowauxi, WhatsApp Business API is automatically configured for your business. You don't need to apply separately. You can start messaging customers immediately. ${city.region ? `Flowauxi serves businesses across ${city.region}.` : ""}`,
  },
  {
    question: `How much does it cost to sell on WhatsApp in ${city.name}?`,
    answer: `You can start selling on WhatsApp in ${city.name} for free with Flowauxi. The free plan includes AI chatbot, order management, invoice automation, and payment integration. As your business grows, premium plans start at ₹799/month. There are no transaction fees on orders — you only pay payment gateway fees (typically 2% via Razorpay). ${city.avgOrderValue ? `The average order value for businesses in ${city.name} is around ₹${city.avgOrderValue.toLocaleString()}.` : ""}`,
  },
  {
    question: `Can I use WhatsApp for business in ${city.state}?`,
    answer: `Yes, WhatsApp Business and WhatsApp Business API work throughout ${city.state} and all of India. ${city.name} businesses use WhatsApp for customer support, order booking, payment collection, and delivery updates. Flowauxi is designed for Indian businesses with Razorpay, UPI, Paytm, and GST-compliant invoicing built in. ${city.nearbyCities && city.nearbyCities.length > 0 ? `Flowauxi also serves nearby cities: ${city.nearbyCities.slice(0, 3).join(", ")}.` : ""}`,
  },
];

export default async function CityPage({ params }: Props) {
  const { city: citySlug } = await params;
  const city = INDIA_CITIES.find((c) => c.slug === citySlug);
  if (!city) notFound();

  const faqQuestions = FAQ_TEMPLATE(city);
  const uniqueContent = generateCityUniqueContent(city);
  const tierCities = INDIA_CITIES.filter((c) => c.tier === city.tier && c.slug !== city.slug).slice(0, 4);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateFaqSchemaForPAA(faqQuestions)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateLocalBusinessSchema(city)) }} />

      <main className="max-w-4xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/whatsapp-store" className="hover:text-gray-700">WhatsApp Store</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{city.name}</span>
        </nav>

        <header className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            WhatsApp Store in {city.name}, {city.state}
          </h1>
          <p className="text-xl text-gray-600 mb-6">
            {uniqueContent}
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
            <span className="bg-gray-100 px-3 py-1 rounded-full">{city.tier.replace("-", " ").toUpperCase()} CITY</span>
            <span className="bg-gray-100 px-3 py-1 rounded-full">{city.region}</span>
            {city.dataQualityScore && city.dataQualityScore >= 80 && (
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full">PREMIUM LISTING</span>
            )}
          </div>
        </header>

        <div className="bg-green-50 border-l-4 border-green-500 p-6 mb-12">
          <h2 className="font-bold text-green-800 mb-2">Quick Start for {city.name} Businesses</h2>
          <ul className="space-y-1 text-gray-700">
            <li>• Free WhatsApp Business API setup</li>
            <li>• AI chatbot trained on your products</li>
            <li>• Order management dashboard</li>
            <li>• Payment collection via Razorpay, UPI</li>
            <li>• Invoice delivery via WhatsApp</li>
            {city.merchantCount && <li>• Join {city.merchantCount.toLocaleString()}+ businesses in {city.name}</li>}
          </ul>
          <Link href="/signup" className="mt-4 inline-block bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700">
            Start Free Today
          </Link>
        </div>

        <div className="prose prose-lg max-w-none">
          <h2 id="about">About {city.name}</h2>
          <p>
            {city.name} is a {city.tier === "tier-1" ? "major metropolitan" : city.tier === "tier-2" ? "growing" : "emerging"} 
            {" "}city in {city.state}, {city.region}. With a population of {city.population.toLocaleString()}, 
            {" "}{city.name} offers significant opportunities for businesses selling directly to customers via WhatsApp.
          </p>
          <p>
            WhatsApp e-commerce is growing rapidly in {city.name} as customers prefer the convenience of 
            browsing products, asking questions, and placing orders — all within WhatsApp chat. 
            D2C brands, local retailers, and home-based businesses use Flowauxi to create their 
            WhatsApp store and start selling within minutes.
          </p>

          <h2 id="why-whatsapp">Why WhatsApp Commerce Works in {city.name}</h2>
          <p>Businesses in {city.name} choose WhatsApp commerce because:</p>
          <ul>
            <li><strong>Customer preference:</strong> Customers in {city.name} prefer messaging over calling or browsing websites</li>
            <li><strong>Trust:</strong> Personal chat builds trust for high-value purchases</li>
            <li><strong>Lower cost:</strong> No website development, no marketplace fees</li>
            <li><strong>Higher conversion:</strong> Chat-based selling converts 3-5x higher than websites</li>
            <li><strong>Instant support:</strong> Answer customer questions in real-time</li>
          </ul>

          <h2 id="features">WhatsApp Store Features for {city.name} Businesses</h2>
          <div className="grid md:grid-cols-2 gap-4 not-prose">
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">AI Chatbot</h3>
              <p className="text-sm text-gray-600">
                24/7 chatbot answers product questions, takes orders, and sends payment links automatically.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Order Management</h3>
              <p className="text-sm text-gray-600">
                Track all orders from your {city.name} business in one dashboard.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Payment Collection</h3>
              <p className="text-sm text-gray-600">
                Razorpay, UPI, Paytm, and PhonePe integration for fast payments.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Delivery Tracking</h3>
              <p className="text-sm text-gray-600">
                Send order status updates to customers via WhatsApp automatically.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Invoice Delivery</h3>
              <p className="text-sm text-gray-600">
                GST-compliant invoices sent to customers via WhatsApp PDF.
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-2">Google Sheets Sync</h3>
              <p className="text-sm text-gray-600">
                Auto-sync orders to Google Sheets for easy inventory tracking.
              </p>
            </div>
          </div>

          <h2 id="payment">Payment Options in {city.name}</h2>
          <p>Flowauxi supports all popular payment methods in {city.name}:</p>
          <ul>
            <li><strong>UPI:</strong> Google Pay, PhonePe, Paytm, BHIM</li>
            <li><strong>Cards:</strong> Credit and debit cards via Razorpay</li>
            <li><strong>Net Banking:</strong> All major Indian banks</li>
            <li><strong>Wallets:</strong> Paytm, PhonePe, Amazon Pay</li>
            <li><strong>Cash on Delivery:</strong> Manual tracking for COD orders</li>
          </ul>
          <p>Payment integration takes 5 minutes to set up. You can start accepting payments from your {city.name} customers immediately.</p>

          <h2 id="courier">Courier Partners in {city.name}</h2>
          <p>Flowauxi integrates with major courier services serving {city.name}:</p>
          <ul>
            <li>Delhivery — Pan-India delivery with tracking</li>
            <li>Ecom Express — Regional and national coverage</li>
            <li>Bluedart — Express delivery</li>
            <li>DTDC — Reliable nationwide network</li>
            <li>Shadowfax — Hyperlocal delivery in {city.name}</li>
          </ul>
          <p>Add tracking numbers to orders and customers receive automatic WhatsApp updates.</p>

          <h2 id="industries">Top Industries for WhatsApp Commerce in {city.name}</h2>
          <p>These industries in {city.name} benefit most from WhatsApp commerce:</p>
          <div className="grid md:grid-cols-3 gap-3 not-prose">
            {["Fashion & Apparel", "Electronics & Gadgets", "Home Decor", "Food & Beverage", "Health & Beauty", "Jewelry"].map((industry) => (
              <Link 
                key={industry}
                href={`/ecommerce/${industry.toLowerCase().replace(/ & | |&/g, "-")}`}
                className="border border-gray-200 rounded-lg p-3 hover:border-green-500 text-center"
              >
                <span className="text-sm font-medium text-gray-900">{industry}</span>
              </Link>
            ))}
          </div>

          <h2 id="nearby">Nearby Cities</h2>
          <p>Flowauxi also serves businesses in nearby cities:</p>
          <div className="flex flex-wrap gap-2 not-prose">
            {tierCities.map((nearbyCity) => (
              <Link
                key={nearbyCity.slug}
                href={`/whatsapp-store/${nearbyCity.slug}`}
                className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-full text-sm text-gray-700"
              >
                {nearbyCity.name}
              </Link>
            ))}
          </div>
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
          <h2 className="text-2xl font-bold mb-4">Start Your WhatsApp Store in {city.name}</h2>
          <p className="mb-6 text-green-100">
            {city.merchantCount 
              ? `Join ${city.merchantCount.toLocaleString()}+ businesses in ${city.name} using Flowauxi.` 
              : `Be among the first businesses in ${city.name} to use Flowauxi.`}
            {" "}Free plan includes AI chatbot, order management, and payments.
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
          <h2 className="text-xl font-bold mb-4">Other Cities in {city.state}</h2>
          <div className="flex flex-wrap gap-3">
            {INDIA_CITIES.filter((c) => c.state === city.state && c.slug !== city.slug).slice(0, 5).map((otherCity) => (
              <Link
                key={otherCity.slug}
                href={`/whatsapp-store/${otherCity.slug}`}
                className="text-green-600 hover:underline"
              >
                {otherCity.name}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}