import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

/**
 * Invoice Automation - Feature Page
 * PRIMARY KEYWORD: WhatsApp invoice automation (2.4K volume)
 */

export const metadata: Metadata = {
  title: "Invoice Automation - Send PDF Invoices via WhatsApp | Flowauxi",
  description:
    "Automate invoice delivery via WhatsApp. Generate professional PDF invoices, customize with your brand, and send automatically after every order. Free plan.",
  keywords: [
    "invoice automation",
    "WhatsApp invoice",
    "automated invoice delivery",
    "PDF invoice generator",
    "invoice via WhatsApp",
    "e-commerce invoicing",
    "GST invoice WhatsApp",
    "invoice automation India",
  ],
  openGraph: {
    title: "Invoice Automation - Send PDF Invoices via WhatsApp",
    description: "Generate and send professional invoices automatically via WhatsApp. Free plan available.",
    url: "https://www.flowauxi.com/features/invoice-automation",
  },
  alternates: { canonical: "https://www.flowauxi.com/features/invoice-automation" },
};

const FAQ_QUESTIONS = [
  {
    question: "How does WhatsApp invoice automation work?",
    answer:
      "WhatsApp invoice automation works in 3 steps: 1) Customer places an order via WhatsApp or your store, 2) Flowauxi automatically generates a professional PDF invoice with order details, pricing, taxes, and your brand logo, 3) The invoice is sent to the customer's WhatsApp instantly. You can customize invoice templates, add GST numbers, payment terms, and brand colors. No manual invoice creation needed.",
  },
  {
    question: "Can I customize the invoice template?",
    answer:
      "Yes, you can fully customize invoice templates. Add your brand logo, change colors, set payment terms (Net 30, COD, etc.), include GST numbers, add bank details for NEFT/RTGS, and customize field order. Templates support multi-language (English, Hindi) and multi-currency (INR, USD, AED). You can create different templates for different customer segments.",
  },
  {
    question: "Is GST invoice supported?",
    answer:
      "Yes, Flowauxi supports GST-compliant invoices for Indian businesses. You can add your GST number, customer GST number, HSN/SAC codes, GST breakdown (CGST, SGST, IGST), and invoice numbers in GST-compliant format. This is included free in all plans.",
  },
  {
    question: "What invoice formats are supported?",
    answer:
      "Flowauxi generates invoices in PDF format, which is the most widely accepted format for business invoices. PDFs are professional, unalterable, and accepted by tax authorities. Customers receive PDFs directly in their WhatsApp chat. You can also export invoice data to Google Sheets for accounting.",
  },
  {
    question: "Can I send invoices for COD orders?",
    answer:
      "Yes, you can send invoices for COD (Cash on Delivery) orders. The invoice will show 'Cash on Delivery' as the payment method. Once payment is collected by the courier, you can update the payment status and send a payment confirmation message via WhatsApp. Flowauxi handles both prepaid and COD invoices.",
  },
];

export default function InvoiceAutomationPage() {
  const faqSchema = generateFaqSchemaForPAA(FAQ_QUESTIONS);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <main className="max-w-7xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/features" className="hover:text-gray-700">Features</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Invoice Automation</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
          Invoice Automation — Send PDF Invoices via WhatsApp
        </h1>

        <p className="text-xl text-gray-600 mb-8 max-w-3xl">
          Automatically generate and send professional PDF invoices to customers via WhatsApp after
          every order. GST-compliant, branded, and fully customizable. Included free with Flowauxi.
        </p>

        <div className="flex flex-wrap gap-4 mb-16">
          <Link href="/signup" className="px-8 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">
            Start Free — Invoice Automation Included
          </Link>
        </div>

        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">How Invoice Automation Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">1</div>
              <h3 className="font-semibold mb-2">Order Received</h3>
              <p className="text-gray-600 text-sm">Customer places order via WhatsApp or your store.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">2</div>
              <h3 className="font-semibold mb-2">Invoice Generated</h3>
              <p className="text-gray-600 text-sm">PDF invoice created with your brand, GST, and order details.</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">3</div>
              <h3 className="font-semibold mb-2">Sent to WhatsApp</h3>
              <p className="text-gray-600 text-sm">Invoice delivered to customer's WhatsApp instantly.</p>
            </div>
          </div>
        </section>

        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Invoice Features</h2>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Custom Brand Templates</h3>
              <p className="text-gray-600">Add your logo, brand colors, and payment terms. Create different templates for B2B and B2C customers.</p>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">GST-Compliant Invoices</h3>
              <p className="text-gray-600">Add GST numbers, HSN codes, and GST breakdown (CGST, SGST, IGST). Valid for Indian tax compliance.</p>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Multi-Currency Support</h3>
              <p className="text-gray-600">Generate invoices in INR, USD, AED, and other currencies. Perfect for international customers.</p>
            </div>
            <div className="border-l-4 border-green-500 pl-6">
              <h3 className="text-xl font-semibold mb-3">Google Sheets Sync</h3>
              <p className="text-gray-600">All invoice data synced to Google Sheets automatically. Export for accounting and reconciliation.</p>
            </div>
          </div>
        </section>

        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {FAQ_QUESTIONS.map((faq, i) => (
              <details key={i} className="group border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between cursor-pointer p-4 font-semibold text-gray-900">
                  {faq.question}
                  <span className="text-green-600 text-2xl group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="p-4 pt-0 text-gray-600"><p>{faq.answer}</p></div>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-green-600 text-white rounded-lg p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Automate Your Invoices Today</h2>
          <p className="mb-8 text-green-100">Send professional PDF invoices via WhatsApp automatically. Free plan available.</p>
          <Link href="/signup" className="inline-block px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50">
            Get Started Free
          </Link>
        </section>

        <section className="mt-20">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Related Features</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Link href="/features/whatsapp-store" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500">
              <h3 className="font-semibold mb-2">WhatsApp Store</h3>
              <p className="text-gray-600 text-sm">Create your store with order automation included.</p>
            </Link>
            <Link href="/features/order-tracking" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500">
              <h3 className="font-semibold mb-2">Order Tracking</h3>
              <p className="text-gray-600 text-sm">Real-time order status updates via WhatsApp.</p>
            </Link>
            <Link href="/features/google-sheets-sync" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500">
              <h3 className="font-semibold mb-2">Google Sheets Sync</h3>
              <p className="text-gray-600 text-sm">Sync invoice data to Google Sheets automatically.</p>
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}