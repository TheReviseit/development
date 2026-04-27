import type { Metadata } from "next";
import Link from "next/link";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

export const metadata: Metadata = {
  title: "How to Sell on WhatsApp Without a Website (2026 Step-by-Step Guide)",
  description: "Learn how to sell products on WhatsApp without a website. Step-by-step guide with AI chatbot setup, payment collection, order management. Start free today.",
  keywords: [
    "how to sell on WhatsApp",
    "sell products on WhatsApp",
    "WhatsApp selling without website",
    "WhatsApp store setup",
    "WhatsApp Business API guide",
    "start selling on WhatsApp",
    "WhatsApp ecommerce tutorial",
  ],
  authors: [{ name: "Flowauxi Team", url: "https://www.flowauxi.com" }],
  openGraph: {
    title: "How to Sell on WhatsApp Without a Website (2026)",
    description: "Complete step-by-step guide to selling on WhatsApp. AI chatbot, payments, orders. Start free.",
    url: "https://www.flowauxi.com/blog/how-to-sell-on-whatsapp",
    type: "article",
    publishedTime: "2026-01-20",
    authors: ["Flowauxi Team"],
    images: [{ url: "/og-sell-on-whatsapp.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title: "How to Sell on WhatsApp Without a Website", images: ["/og-sell-on-whatsapp.png"] },
  alternates: { canonical: "https://www.flowauxi.com/blog/how-to-sell-on-whatsapp" },
};

const FAQ_QUESTIONS = [
  { question: "How do I start selling on WhatsApp?", answer: "To start selling on WhatsApp: 1) Sign up for a WhatsApp Commerce platform like Flowauxi (free), 2) Upload your product catalog with images and prices, 3) Set up payment collection (Razorpay, UPI), 4) Share your store link on social media and WhatsApp groups, 5) When customers message, respond or let AI chatbot handle queries, 6) Process orders and send tracking updates via WhatsApp. You can start in under 10 minutes with Flowauxi's free plan." },
  { question: "Can I sell on WhatsApp without a website?", answer: "Yes, you can sell on WhatsApp without any website. WhatsApp commerce platforms like Flowauxi provide a shareable store link (e.g., wa.me/919876543210) that customers use to browse products and message you. The entire shopping experience — product catalog, ordering, payment, tracking — happens within WhatsApp chat. This is ideal for small businesses and D2C brands that don't want to build and maintain a website." },
  { question: "How much does it cost to sell on WhatsApp?", answer: "You can start selling on WhatsApp for free with platforms like Flowauxi. The free plan includes AI chatbot, order management, invoice automation, and payment integration. WhatsApp Business API costs are covered by the platform. As you grow, paid plans start around ₹799/month for higher volume. Compare this to building a website (₹50,000+) or marketplace fees (10-20% per sale). WhatsApp selling is the lowest-cost way to start an e-commerce business." },
  { question: "How do I receive payments on WhatsApp?", answer: "You receive payments on WhatsApp by integrating a payment gateway (Razorpay, Paytm, PhonePe, UPI). When a customer places an order, a payment link is generated and sent in the chat. The customer clicks the link and pays via UPI, card, or net banking. You receive confirmation, and the order updates automatically. Flowauxi has built-in Razorpay and UPI integration that takes 5 minutes to set up." },
  { question: "What can I sell on WhatsApp?", answer: "You can sell almost any physical or digital product on WhatsApp: fashion, electronics, home decor, food, jewelry, books, beauty products, and more. High-touch categories like fashion and jewelry perform well because customers can ask questions before buying. Categories that benefit from visual browsing (Instagram-to-WhatsApp) work best. You need WhatsApp Business API for selling, which is included free when you sign up for platforms like Flowauxi." },
];

export default function HowToSellOnWhatsAppPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateFaqSchemaForPAA(FAQ_QUESTIONS)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "HowTo",
        name: "How to Sell on WhatsApp Without a Website",
        description: "Step-by-step guide to setting up a WhatsApp store and selling products via WhatsApp chat",
        step: [
          { "@type": "HowToStep", name: "Sign Up", text: "Create account on Flowauxi WhatsApp commerce platform", position: 1 },
          { "@type": "HowToStep", name: "Add Products", text: "Upload product catalog with images and prices", position: 2 },
          { "@type": "HowToStep", name: "Set Up Payments", text: "Connect Razorpay or UPI for payment collection", position: 3 },
          { "@type": "HowToStep", name: "Configure Chatbot", text: "Set up AI chatbot to answer customer questions", position: 4 },
          { "@type": "HowToStep", name: "Share Link", text: "Share store link on social media and WhatsApp groups", position: 5 },
        ],
        totalTime: "PT10M",
        estimatedCost: { "@type": "MonetaryAmount", currency: "INR", value: "0" },
      }) }} />

      <article className="max-w-4xl mx-auto px-4 py-16">
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link><span className="mx-2">/</span><Link href="/blog" className="hover:text-gray-700">Blog</Link><span className="mx-2">/</span><span className="text-gray-900">How to Sell on WhatsApp</span>
        </nav>

        <header className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">How to Sell on WhatsApp Without a Website</h1>
          <p className="text-xl text-gray-600 mb-6">Step-by-step guide to setting up your WhatsApp store, collecting payments, automating orders, and growing sales — all without building a website.</p>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span>By Flowauxi Team</span>
            <span>•</span>
            <span>January 20, 2026</span>
            <span>•</span>
            <span>12 min read</span>
          </div>
        </header>

        <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-12">
          <h2 className="font-bold text-blue-800 mb-2">What You'll Learn</h2>
          <ul className="space-y-1 text-gray-700">
            <li>• How to set up WhatsApp Business API for selling</li>
            <li>• Step-by-step product catalog creation</li>
            <li>• Payment collection via UPI, Razorpay, Paytm</li>
            <li>• AI chatbot setup for 24/7 customer handling</li>
            <li>• Order management without a website</li>
            <li>• Proven strategies to get customers on WhatsApp</li>
          </ul>
        </div>

        <div className="prose prose-lg max-w-none">
          <h2 id="why-whatsapp">Why Sell on WhatsApp?</h2>
          <p>Selling on WhatsApp is the fastest-growing channel for e-commerce in India. Here's why 500+ million Indians prefer buying through WhatsApp:</p>
          <ul>
            <li><strong>Trust:</strong> Customers trust chat conversations more than website checkouts</li>
            <li><strong>Convenience:</strong> No app downloads, no website navigation — just message and buy</li>
            <li><strong>Higher conversion:</strong> Chat-based selling converts 3-5x higher than websites</li>
            <li><strong>Lower cost:</strong> No website development, no marketplace fees</li>
            <li><strong>Instant support:</strong> Answer questions in real-time during the purchase</li>
          </ul>

          <h2 id="step-by-step">Step-by-Step: How to Start Selling on WhatsApp</h2>
          
          <h3>Step 1: Get WhatsApp Business API</h3>
          <p>WhatsApp Business API is required for selling at scale. Regular WhatsApp Business app is limited. With API, you can send template messages, automate responses, and integrate with payment systems.</p>
          <p><strong>How to get it:</strong> Sign up for a WhatsApp commerce platform like Flowauxi. WhatsApp Business API is set up automatically when you create your account. No technical knowledge required.</p>
          
          <h3>Step 2: Create Your Product Catalog</h3>
          <p>Your product catalog is what customers browse when they message your business. Include:</p>
          <ul>
            <li>High-quality product images (2-5 per product)</li>
            <li>Clear product names (include style/color/size)</li>
            <li>Prices with GST if applicable</li>
            <li>Availability status</li>
            <li>Product variations (size, color)</li>
          </ul>
          <p><strong>Tip:</strong> Flowauxi lets you upload products via CSV or add them manually. Catalog is automatically shared in WhatsApp chat.</p>
          
          <h3>Step 3: Set Up Payment Collection</h3>
          <p>Customers pay via payment links sent in chat. When they click, they see UPI, card, or net banking options. You need a payment gateway:</p>
          <ul>
            <li><strong>Razorpay:</strong> Best for Indian businesses. UPI, cards, net banking, wallets.</li>
            <li><strong>Paytm/PhonePe:</strong> Good for UPI-focused businesses.</li>
            <li><strong>Cash on Delivery:</strong> For customers who prefer paying on delivery.</li>
          </ul>
          <p><strong>Setup time:</strong> 5 minutes on Flowauxi. Connect your Razorpay account and payment links are auto-generated.</p>
          
          <h3>Step 4: Configure AI Chatbot (Optional)</h3>
          <p>AI chatbot handles customer questions 24/7. It's trained on your product catalog and can:</p>
          <ul>
            <li>Answer product questions (price, availability, specs)</li>
            <li>Take orders when you're unavailable</li>
            <li>Send payment links automatically</li>
            <li>Provide order status updates</li>
            <li>Escalate complex queries to you</li>
          </ul>
          <p><strong>Cost:</strong> Free on Flowauxi. Other platforms charge ₹500-2000/month for similar chatbot.</p>
          
          <h3>Step 5: Share Your Store Link</h3>
          <p>Your WhatsApp store has a unique link that opens a chat with your business:</p>
          <ul>
            <li><strong>Share on Instagram:</strong> Add to bio, stories, and posts</li>
            <li><strong>Share on Facebook:</strong> Post link and run ads that direct to WhatsApp</li>
            <li><strong>Share in WhatsApp groups:</strong> Post in relevant groups (don't spam)</li>
            <li><strong>Add to Google My Business:</strong> Let customers find you on Google Maps</li>
            <li><strong>Run Click-to-WhatsApp ads:</strong> Facebook/Instagram ads that open WhatsApp chat</li>
          </ul>
          
          <h3>Step 6: Process Orders and Send Updates</h3>
          <p>When orders come in, you'll see them in your dashboard. For each order:</p>
          <ol>
            <li>Confirm order via WhatsApp (can be automated)</li>
            <li>Collect payment if not paid</li>
            <li>Process fulfillment</li>
            <li>Send tracking link via WhatsApp</li>
            <li>Follow up after delivery for reviews</li>
          </ol>
          <p>Flowauxi automates steps 1, 4, and 5. Invoices are sent via WhatsApp automatically.</p>

          <h2 id="pricing">Cost Breakdown: Selling on WhatsApp</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead><tr className="bg-gray-100"><th className="text-left p-4 border">Item</th><th className="text-left p-4 border">Cost with Flowauxi</th><th className="text-left p-4 border">Cost Without Platform</th></tr></thead>
              <tbody>
                <tr><td className="p-4 border">WhatsApp Business API</td><td className="p-4 border text-green-600">Free (included)</td><td className="p-4 border">₹1,000+/mo</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">Product Catalog</td><td className="p-4 border text-green-600">Free</td><td className="p-4 border">Manual</td></tr>
                <tr><td className="p-4 border">AI Chatbot</td><td className="p-4 border text-green-600">Free (included)</td><td className="p-4 border">₹500-2,000/mo</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">Order Management</td><td className="p-4 border text-green-600">Free</td><td className="p-4 border">Manual/Sheets</td></tr>
                <tr><td className="p-4 border">Invoice Generation</td><td className="p-4 border text-green-600">Free</td><td className="p-4 border">₹200/mo</td></tr>
                <tr className="bg-gray-50"><td className="p-4 border">Payment Gateway Fees</td><td className="p-4 border">2% (Razorpay)</td><td className="p-4 border">2% (Razorpay)</td></tr>
                <tr className="bg-gray-100 font-semibold"><td className="p-4 border">Monthly Cost (Small Business)</td><td className="p-4 border text-green-600">₹0</td><td className="p-4 border">₹1,700+</td></tr>
              </tbody>
            </table>
          </div>

          <h2 id="tips">Pro Tips for WhatsApp Selling</h2>
          
          <h3>1. Respond within 5 minutes</h3>
          <p>WhatsApp customers expect quick replies. If you can't respond manually, use AI chatbot. Flowauxi's chatbot responds instantly.</p>
          
          <h3>2. Send payment links, not account numbers</h3>
          <p>Payment links (UPI, card) convert higher than asking customers to transfer money. Links also auto-confirm orders.</p>
          
          <h3>3. Use catalog photos, not random images</h3>
          <p>High-quality product photos in your catalog get 2-3x more inquiries. Blurry screenshots reduce trust.</p>
          
          <h3>4. Follow up on abandoned carts</h3>
          <p>70% of WhatsApp customers add products but don't buy. Send a follow-up message after 24 hours with a discount or reminder.</p>
          
          <h3>5. Share tracking updates proactively</h3>
          <p>Send order confirmed, shipped, and delivered updates via WhatsApp. Customers love real-time tracking and it reduces support messages.</p>

          <h2 id="faqs">Frequently Asked Questions</h2>
        </div>

        <section className="mt-16">
          <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {FAQ_QUESTIONS.map((faq, i) => (
              <details key={i} className="group border border-gray-200 rounded-lg">
                <summary className="flex items-center justify-between cursor-pointer p-4 font-semibold text-gray-900">{faq.question}<span className="text-green-600 text-2xl group-open:rotate-180">▼</span></summary>
                <div className="p-4 pt-0 text-gray-600"><p>{faq.answer}</p></div>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-16 bg-green-600 text-white rounded-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to Start Selling on WhatsApp?</h2>
          <p className="mb-6 text-green-100">Flowauxi gives you WhatsApp Business API, AI chatbot, order management, and payments — all free to start.</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/signup" className="px-8 py-4 bg-white text-green-600 rounded-lg font-semibold hover:bg-green-50">Start Free Today</Link>
            <Link href="/features/whatsapp-store" className="px-8 py-4 border-2 border-white rounded-lg font-semibold hover:bg-green-700">See WhatsApp Store Features</Link>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-xl font-bold mb-6">Related Articles</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Link href="/blog/what-is-whatsapp-ecommerce" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500">
              <h3 className="font-semibold mb-2">What is WhatsApp E-commerce?</h3>
              <p className="text-gray-600 text-sm">Complete guide to WhatsApp commerce for beginners.</p>
            </Link>
            <Link href="/blog/best-whatsapp-chatbot-ecommerce" className="block p-6 border border-gray-200 rounded-lg hover:border-green-500">
              <h3 className="font-semibold mb-2">Best WhatsApp Chatbot for E-commerce</h3>
              <p className="text-gray-600 text-sm">Compare chatbot platforms for your store.</p>
            </Link>
          </div>
        </section>

        <section className="mt-16 border-t pt-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center"><span className="text-gray-600 font-semibold">FA</span></div>
            <div>
              <p className="font-semibold text-gray-900">Flowauxi Team</p>
              <p className="text-gray-500 text-sm">Last updated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
            </div>
          </div>
          <p className="text-gray-600 text-sm mt-4">This article was written by the Flowauxi team, experts in WhatsApp commerce and e-commerce automation. We've helped businesses across India sell on WhatsApp.</p>
        </section>
      </article>
    </>
  );
}