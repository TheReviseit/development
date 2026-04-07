import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

/**
 * Order Tracking via WhatsApp - Feature Page (FAANG-Level SEO)
 * PRIMARY KEYWORD: WhatsApp order tracking (2.4K volume)
 */

export const metadata: Metadata = {
  title: "Order Tracking via WhatsApp - Real-Time Status Updates | Flowauxi",
  description:
    "Send real-time order status updates via WhatsApp. Reduce support tickets by 70%. Order confirmed, shipped, out for delivery — all automated. Free plan.",
  keywords: [
    "order tracking WhatsApp",
    "WhatsApp order status",
    "order tracking system",
    "real-time order updates",
    "WhatsApp delivery tracking",
    "customer order notifications",
    "order tracking for e-commerce",
    "automated order updates",
  ],
  openGraph: {
    title: "Order Tracking via WhatsApp - Real-Time Status Updates",
    description: "Reduce support tickets by 70% with automated WhatsApp order tracking. Free plan.",
    url: "https://www.flowauxi.com/features/order-tracking",
    images: [{ url: "/og-order-tracking.png", width: 1200, height: 630 }],
  },
  alternates: { canonical: "https://www.flowauxi.com/features/order-tracking" },
};

const FAQ_QUESTIONS = [
  {
    question: "How does WhatsApp order tracking work?",
    answer:
      "WhatsApp order tracking works by sending automated status updates to customers via WhatsApp. When an order status changes (confirmed, processing, shipped, out for delivery, delivered), Flowauxi sends a WhatsApp message to the customer with the new status, tracking link, and estimated delivery time. Customers can also ask 'Where is my order?' and get instant status without calling support. This reduces support tickets by 70%.",
  },
  {
    question: "Can customers track their orders without calling support?",
    answer:
      "Yes, customers can track orders without calling support. They simply send a message like 'Where is my order?' or 'Order status' to your WhatsApp Business number, and the AI chatbot responds instantly with the current status, tracking number, and delivery estimate. For businesses, this means 70% fewer support calls. For customers, it means instant answers 24/7.",
  },
  {
    question: "What order statuses can I send via WhatsApp?",
    answer:
      "Flowauxi supports all standard e-commerce order statuses: Order Confirmed, Processing, Shipped, Out for Delivery, Delivered, and Cancelled. Each status triggers an automated WhatsApp message to the customer. You can customize the message templates for each status. For example, 'Shipped' can include the tracking number and courier partner name.",
  },
  {
    question: "Can I send custom order updates via WhatsApp?",
    answer:
      "Yes, you can send custom order updates via WhatsApp. In addition to standard statuses (confirmed, shipped, delivered), you can create custom updates like 'Quality check in progress', 'Awaiting payment', 'On hold', or custom delay messages. These appear in the customer's WhatsApp chat. You can also send manual updates for exceptional situations.",
  },
  {
    question: "Is WhatsApp order tracking free?",
    answer:
      "Yes, WhatsApp order tracking is included free with Flowauxi's free plan. There are no additional charges for sending order status updates via WhatsApp. The free plan includes unlimited order tracking messages. You only pay if you need premium features like custom branding, priority support, or advanced analytics.",
  },
];

export default function OrderTrackingPage() {
  const faqSchema = generateFaqSchemaForPAA(FAQ_QUESTIONS);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Flowauxi Order Tracking",
            applicationCategory: "BusinessApplication",
            applicationSubCategory: "Order Management",
            featureList: ["Real-time Updates", "WhatsApp Notifications", "Customer Self-Service", "Automated Messaging", "Tracking Integration", "Status Timeline"],
          }),
        }}
      />

      <main className="max-w-7xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/features" className="hover:text-gray-700">Features</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Order Tracking</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
          Order Tracking via WhatsApp
        </h1>

        <p className="text-xl text-gray-600 mb-8 max-w-3xl">
          Send real-time order status updates via WhatsApp. Reduce support tickets by 70%. Customers
          track orders without calling — just ask on WhatsApp and get instant answers.
        </p>

        <div className="flex flex-wrap gap-4 mb-16">
          <Link href="/signup" className="px-8 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition">
            Start Free — Order Tracking Included
          </Link>
          <Link href="#how-it-works" className="px-8 py-4 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition">
            See How It Works
          </Link>
        </div>

        {/* Benefits */}
        <section className="mb-20">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="text-3xl mb-4">📊</div>
              <h3 className="text-lg font-semibold mb-2">70% Fewer Support Tickets</h3>
              <p className="text-gray-600">Customers get instant answers from WhatsApp. No more "Where is my order?" calls.</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="text-3xl mb-4">⚡</div>
              <h3 className="text-lg font-semibold mb-2">Instant Updates 24/7</h3>
              <p className="text-gray-600">Order confirmed, shipped, delivered — customers get status updates automatically.</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
              <div className="text-3xl mb-4">💬</div>
              <h3 className="text-lg font-semibold mb-2">Customer Self-Service</h3>
              <p className="text-gray-600">Customers ask "Where is my order?" and get instant tracking info via chat.</p>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">How Order Tracking Works</h2>
          <div className="grid md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">1</div>
              <h3 className="font-semibold mb-2">Order Placed</h3>
              <p className="text-gray-600 text-sm">Customer places order via WhatsApp or store.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">2</div>
              <h3 className="font-semibold mb-2">Auto Message</h3>
              <p className="text-gray-600 text-sm">Customer receives "Order Confirmed" on WhatsApp.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">3</div>
              <h3 className="font-semibold mb-2">Status Updates</h3>
              <p className="text-gray-600 text-sm">Each status change (shipped, out for delivery) triggers WhatsApp message.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">4</div>
              <h3 className="font-semibold mb-2">Customer Asks</h3>
              <p className="text-gray-600 text-sm">"Where is my order?" gets instant reply with tracking info.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">5</div>
              <h3 className="font-semibold mb-2">Delivered</h3>
              <p className="text-gray-600 text-sm">Customer receives delivery confirmation with photos.</p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Order Tracking Features</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Real-Time Status Updates</h3>
              <p className="text-gray-600 mb-4">Send order confirmed, processing, shipped, out for delivery, and delivered updates automatically. Each status triggers a WhatsApp message.</p>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Customer Self-Service</h3>
              <p className="text-gray-600 mb-4">Customers ask "Where is my order?" and get instant tracking info. AI chatbot responds with current status, tracking number, and ETA.</p>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Delivery Photo Proof</h3>
              <p className="text-gray-600 mb-4">Courier uploads delivery photo, customer receives photo confirmation via WhatsApp. Reduces "not received" disputes.</p>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Custom Messages</h3>
              <p className="text-gray-600 mb-4">Create custom status messages with your brand voice. "Your order is being prepared with love!" — fully customizable.</p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {FAQ_QUESTIONS.map((faq, i) => (
              <details key={i} className="group border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between cursor-pointer p-6 font-semibold text-gray-900">
                  {faq.question}
                  <span className="text-green-600 text-2xl group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="p-6 pt-0 text-gray-600"><p>{faq.answer}</p></div>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-green-600 text-white rounded-lg p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Reduce Support Tickets by 70%</h2>
          <p className="mb-8 text-green-100">Start order tracking via WhatsApp. Free plan available.</p>
          <Link href="/signup" className="inline-block px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50 transition">
            Start Free Today
          </Link>
        </section>

        {/* Related */}
        <section className="mt-20">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Related Features</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Link href="/features/whatsapp-store" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500 transition">
              <h3 className="font-semibold mb-2">WhatsApp Store Builder</h3>
              <p className="text-gray-600 text-sm">Create your online store with AI chatbot included.</p>
            </Link>
            <Link href="/features/invoice-automation" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500 transition">
              <h3 className="font-semibold mb-2">Invoice Automation</h3>
              <p className="text-gray-600 text-sm">Send PDF invoices automatically via WhatsApp.</p>
            </Link>
            <Link href="/features/order-automation" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500 transition">
              <h3 className="font-semibold mb-2">Order Automation</h3>
              <p className="text-gray-600 text-sm">Automate order booking via WhatsApp chat.</p>
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}