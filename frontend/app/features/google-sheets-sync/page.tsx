import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

export const metadata: Metadata = {
  title: "Google Sheets Sync - Auto-Sync Orders to Spreadsheets | Flowauxi",
  description: "Every order syncs to Google Sheets automatically. Track revenue, inventory, and customers in real-time. No manual entry. Free plan available.",
  keywords: ["Google Sheets sync", "order sync Google Sheets", "e-commerce spreadsheet", "inventory tracker", "order management spreadsheet"],
  alternates: { canonical: "https://www.flowauxi.com/features/google-sheets-sync" },
};

const FAQ_QUESTIONS = [
  { question: "How does Google Sheets sync work?", answer: "Google Sheets sync works by automatically sending order data to a Google Sheet whenever an order is placed. You authorize Flowauxi to access your Google Sheets, select which sheet to sync to, and every order thereafter appears in your spreadsheet in real-time. No manual data entry required." },
  { question: "What data syncs to Google Sheets?", answer: "All order data syncs: order ID, customer name, phone, email, products, quantities, prices, order total, payment method, order status, shipping address, order date, and timestamp. You can customize which columns to include." },
  { question: "Is Google Sheets sync free?", answer: "Yes, Google Sheets sync is included free with every Flowauxi plan, including the free tier. There are no additional charges for syncing orders to Google Sheets." },
  { question: "Can I have multiple Google Sheets?", answer: "Yes, you can sync to multiple Google Sheets. For example, one sheet for active orders, one for completed orders, one for customer database. Each sync can be customized with different columns and filters." },
];

export default function GoogleSheetsSyncPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateFaqSchemaForPAA(FAQ_QUESTIONS)) }} />
      <main className="max-w-7xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/features" className="hover:text-gray-700">Features</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Google Sheets Sync</span>
        </nav>

        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">Google Sheets Sync — Auto-Sync Orders</h1>

        <p className="text-xl text-gray-600 mb-8 max-w-3xl">
          Every order syncs to Google Sheets automatically. Track revenue, inventory, and customers in real-time. No manual data entry. Free.
        </p>

        <div className="flex flex-wrap gap-4 mb-16">
          <Link href="/signup" className="px-8 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">Start Free — Google Sheets Included</Link>
        </div>

        <section className="mb-20">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="text-3xl mb-4">📊</div>
              <h3 className="text-lg font-semibold mb-2">Real-Time Sync</h3>
              <p className="text-gray-600">Orders appear in Google Sheets within seconds. No delay.</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="text-3xl mb-4">🔄</div>
              <h3 className="text-lg font-semibold mb-2">No Manual Entry</h3>
              <p className="text-gray-600">Stop copy-pasting order data. Everything syncs automatically.</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="text-3xl mb-4">📈</div>
              <h3 className="text-lg font-semibold mb-2">Custom Reports</h3>
              <p className="text-gray-600">Use Google Sheets to create custom dashboards, reports, and charts.</p>
            </div>
          </div>
        </section>

        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">How Google Sheets Sync Works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="p-4">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">1</div>
              <h3 className="font-semibold mb-2">Connect Google Account</h3>
              <p className="text-gray-600 text-sm">Authorize Flowauxi to access your Google Sheets.</p>
            </div>
            <div className="p-4">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">2</div>
              <h3 className="font-semibold mb-2">Select Spreadsheet</h3>
              <p className="text-gray-600 text-sm">Choose which Google Sheet to sync orders to.</p>
            </div>
            <div className="p-4">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">3</div>
              <h3 className="font-semibold mb-2">Orders Sync Auto</h3>
              <p className="text-gray-600 text-sm">Every new order appears in your sheet instantly.</p>
            </div>
            <div className="p-4">
              <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xl font-bold mb-4">4</div>
              <h3 className="font-semibold mb-2">Build Reports</h3>
              <p className="text-gray-600 text-sm">Use Google Sheets to create dashboards and reports.</p>
            </div>
          </div>
        </section>

        <section className="mb-20">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">FAQs</h2>
          <div className="space-y-4">
            {FAQ_QUESTIONS.map((faq, i) => (
              <details key={i} className="group border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between cursor-pointer p-4 font-semibold text-gray-900">{faq.question}<span className="text-green-600 text-2xl group-open:rotate-180">▼</span></summary>
                <div className="p-4 pt-0 text-gray-600"><p>{faq.answer}</p></div>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-green-600 text-white rounded-lg p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">Sync Orders to Google Sheets Free</h2>
          <Link href="/signup" className="inline-block px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50">Start Free</Link>
        </section>
      </main>
    </>
  );
}