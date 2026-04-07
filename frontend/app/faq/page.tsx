import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Frequently Asked Questions | Flowauxi Help Center",
  description: "Find answers to common questions about Flowauxi WhatsApp automation, AI chatbot, order management, payments, and more. Get help fast.",
  keywords: [
    "Flowauxi FAQ",
    "WhatsApp automation questions",
    "WhatsApp chatbot help",
    "Flowauxi support",
    "how to use Flowauxi",
    "WhatsApp Business API FAQ",
  ],
  openGraph: {
    title: "Flowauxi FAQ | Frequently Asked Questions",
    description: "Find answers to common questions about WhatsApp automation, AI chatbot, and more.",
    url: "https://www.flowauxi.com/faq",
    type: "website",
  },
  alternates: { canonical: "https://www.flowauxi.com/faq" },
};

const FAQ_CATEGORIES = [
  {
    name: "Getting Started",
    questions: [
      {
        question: "What is Flowauxi?",
        answer: "Flowauxi is a WhatsApp automation platform that helps businesses automate customer conversations, order management, and marketing. It includes AI chatbot, order tracking, invoice delivery, and payment integration — all for selling on WhatsApp.",
      },
      {
        question: "How do I sign up for Flowauxi?",
        answer: "Sign up for free at flowauxi.com/signup. Enter your phone number, verify with OTP, and your WhatsApp Business API account is created automatically. No technical knowledge required.",
      },
      {
question: "Is Flowauxi free?",
        answer: "Flowauxi gives you a free website when you create your account, plus a 7-day free trial of all features. After the trial, plans start at ₹1,999/month for the Shop plan. The free website is yours to keep — you only pay when you want premium features like higher product limits, custom branding, or advanced analytics.",
      },
      {
        question: "How do I sign up for Flowauxi?",
        answer: "Sign up for free at flowauxi.com/signup. Enter your phone number, verify with OTP, and your WhatsApp Business API account is created automatically. You'll get your free website immediately, plus a 7-day free trial of premium features. No credit card required to start.",
      },
      {
        question: "Do I need to install an app?",
        answer: "No, Flowauxi is a web-based platform. Access your dashboard from any browser. For WhatsApp messaging, we use the official WhatsApp Business API which doesn't require installing any app.",
      },
      {
        question: "What's included in the 7-day free trial?",
        answer: "The 7-day free trial includes: AI chatbot, product catalog, order management, invoice automation, payment integration (Razorpay, UPI), WhatsApp Business API, Google Sheets sync, and analytics. After the trial, you keep your free website and can choose a paid plan for continued premium features.",
      },
      {
        question: "Do I need to install an app?",
        answer: "No, Flowauxi is a web-based platform. Access your dashboard from any browser. For WhatsApp messaging, we use the official WhatsApp Business API which doesn't require installing any app.",
      },
    ],
  },
  {
    name: "WhatsApp Business API",
    questions: [
      {
        question: "What is WhatsApp Business API?",
        answer: "WhatsApp Business API is the official enterprise solution from Meta for businesses to send and receive messages at scale. Unlike regular WhatsApp, it supports automation, chatbots, template messages, and integration with business systems. Flowauxi handles all the technical setup for you.",
      },
      {
        question: "How is Flowauxi different from WhatsApp Business app?",
        answer: "WhatsApp Business app is for small businesses with one person managing messages. Flowauxi uses WhatsApp Business API which supports multiple team members, AI chatbot automation, template messages, broadcast campaigns, and integration with order management systems. It's designed for scaling businesses.",
      },
      {
        question: "Can I use my existing WhatsApp number?",
        answer: "Yes, you can migrate your existing WhatsApp number to Flowauxi. The number will be upgraded to WhatsApp Business API. You cannot use the same number on WhatsApp Business app and WhatsApp Business API simultaneously.",
      },
      {
        question: "How much do WhatsApp messages cost?",
        answer: "WhatsApp charges per conversation (24-hour session). Business-initiated conversations cost ₹0.30-0.80 depending on the country. Customer-initiated conversations in the last 24 hours are free. Flowauxi doesn't charge additional messaging fees — you pay only WhatsApp's rates.",
      },
    ],
  },
  {
    name: "AI Chatbot",
    questions: [
      {
        question: "How does the AI chatbot work?",
        answer: "Flowauxi's AI chatbot is trained on your product catalog and FAQs. When customers message your WhatsApp, the chatbot answers product questions, provides pricing, helps them place orders, and sends payment links — all 24/7. You can customize responses and hand off to human agents for complex queries.",
      },
      {
        question: "Can I customize what the chatbot says?",
        answer: "Yes, you can train the chatbot with custom FAQs, product descriptions, and response templates. The chatbot learns from your product catalog automatically. You can also set up handoff rules when customers need human support.",
      },
      {
        question: "Is the chatbot available 24/7?",
        answer: "Yes, the chatbot responds instantly 24/7. Customers get immediate answers even at 2 AM. For complex queries, you can configure the chatbot to take a message and alert your team during business hours.",
      },
      {
        question: "What languages does the chatbot support?",
        answer: "Flowauxi's chatbot supports English, Hindi, and other Indian languages. You can configure the chatbot to auto-detect customer language or default to a specific language.",
      },
    ],
  },
  {
    name: "Orders & Payments",
    questions: [
      {
        question: "How do customers place orders?",
        answer: "Customers can place orders via WhatsApp chat. They can browse your product catalog (sent as a message), ask questions, and confirm orders — all within WhatsApp. Payment links are sent automatically, and order confirmations are sent once payment is received.",
      },
      {
        question: "What payment methods are supported?",
        answer: "Flowauxi integrates with Razorpay, Paytm, PhonePe, Google Pay (UPI), and card payments. When customers click the payment link, they see all available options. You receive instant confirmation once payment is done.",
      },
      {
        question: "How do I track orders?",
        answer: "Use the Flowauxi dashboard to see all orders, their status (pending, confirmed, shipped, delivered), and customer details. When you update order status, customers receive automatic WhatsApp notifications.",
      },
      {
        question: "Can I send tracking updates via WhatsApp?",
        answer: "Yes, order status updates are automatically sent via WhatsApp. Customers receive: order confirmed, payment received, order shipped (with tracking link), and out for delivery notifications. You can also send custom updates.",
      },
    ],
  },
  {
    name: "Pricing & Billing",
    questions: [
      {
        question: "What's included in the free plan?",
        answer: "The free plan includes: AI chatbot, product catalog, order management, invoice automation (up to 50 invoices/month), payment integration (Razorpay, UPI), WhatsApp Business API, Google Sheets sync, and basic analytics. No credit card required.",
      },
      {
        question: "What are the paid plan features?",
        answer: "Paid plans (starting at ₹1,999/month for Shop) include: higher product limits, unlimited invoices, priority support, custom branding, team member accounts, advanced analytics, broadcast campaigns, and API access. Compare plans at flowauxi.com/pricing.",
      },
      {
        question: "Can I cancel anytime?",
        answer: "Yes, you can cancel your subscription anytime from the dashboard. Your plan remains active until the end of the billing period. After cancellation, you keep your free website with basic features. Your data remains accessible.",
      },
      {
        question: "Are there any hidden fees?",
        answer: "No. Flowauxi has transparent pricing. The only additional costs are: WhatsApp conversation fees (charged by Meta, not Flowauxi) and payment gateway fees (charged by Razorpay/Paytm, typically 2%). Flowauxi doesn't add any markup.",
      },
    ],
  },
  {
    name: "Technical & Support",
    questions: [
      {
        question: "Do I need coding knowledge?",
        answer: "No coding is required. Flowauxi is designed for non-technical users. You can set up your store, upload products, configure chatbot, and manage orders all from a simple dashboard. Everything is point-and-click.",
      },
      {
        question: "How do I contact support?",
        answer: "Email us at support@flowauxi.com or message us on WhatsApp. Free plan users get email support (24-48 hour response). Paid plan users get priority support with WhatsApp support for urgent issues.",
      },
      {
        question: "Is my data secure?",
        answer: "Yes. Flowauxi uses industry-standard encryption (TLS 1.3) for all data. We store data in SOC 2 compliant data centers. Your customer data is yours — we never sell or share it. See our privacy policy at flowauxi.com/privacy.",
      },
      {
        question: "Can I export my data?",
        answer: "Yes, you can export all your data (customers, orders, products) from the dashboard at any time. Go to Settings > Export Data. Data is available in CSV format.",
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-16">
      <nav className="text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">FAQ</span>
      </nav>

      <header className="mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          Frequently Asked Questions
        </h1>
        <p className="text-xl text-gray-600">
          Find answers to common questions about Flowauxi, WhatsApp automation, and getting started.
        </p>
      </header>

      {/* Jump to category */}
      <nav className="mb-12 flex flex-wrap gap-2">
        {FAQ_CATEGORIES.map((category) => (
          <a
            key={category.name}
            href={`#${category.name.toLowerCase().replace(/\s+/g, "-")}`}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-full text-sm font-medium text-gray-700"
          >
            {category.name}
          </a>
        ))}
      </nav>

      {/* FAQ sections */}
      {FAQ_CATEGORIES.map((category) => (
        <section
          key={category.name}
          id={category.name.toLowerCase().replace(/\s+/g, "-")}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-6">{category.name}</h2>
          <div className="space-y-4">
            {category.questions.map((faq, i) => (
              <details key={i} className="group border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between cursor-pointer p-4 font-semibold text-gray-900">
                  {faq.question}
                  <span className="text-green-600 text-2xl group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="p-4 pt-0 text-gray-600">
                  <p>{faq.answer}</p>
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      {/* CTA */}
      <section className="mt-16 bg-green-600 text-white rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">Still have questions?</h2>
        <p className="mb-6 text-green-100">
          Our support team is here to help. Reach out via email or WhatsApp.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <a href="mailto:support@flowauxi.com" className="px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50">
            Email Support
          </a>
          <Link href="/signup" className="px-8 py-4 border-2 border-white rounded-lg font-semibold hover:bg-green-700">
            Start Free Trial
          </Link>
        </div>
      </section>
    </main>
  );
}