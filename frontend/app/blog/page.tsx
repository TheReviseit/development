import Link from "next/link";
import {
  ArrowRight,
  Clock,
  MessageSquare,
  ShoppingBag,
  Zap,
} from "lucide-react";

/**
 * Blog Index Page — Long-tail keyword traffic capture
 *
 * These articles target informational queries that funnel into:
 * → shop.flowauxi.com (WhatsApp e-commerce platform)
 * → /signup (conversion)
 */

const blogArticles = [
  {
    slug: "how-to-automate-whatsapp-orders",
    title: "How to Automate WhatsApp Orders for Your Online Store in 2026",
    excerpt:
      "A step-by-step guide to setting up WhatsApp order automation for e-commerce. Learn how to connect WhatsApp Business API, configure AI chatbots, and process orders automatically — with real examples from Indian D2C brands.",
    category: "Guide",
    readTime: "8 min read",
    icon: <ShoppingBag className="h-5 w-5" />,
    keywords: [
      "automate WhatsApp orders",
      "WhatsApp order automation",
      "WhatsApp Business API setup",
    ],
    color: "from-green-500 to-emerald-600",
  },
  {
    slug: "best-whatsapp-chatbot-ecommerce",
    title:
      "Best WhatsApp Chatbot for E-commerce in 2026: Complete Comparison",
    excerpt:
      "Comparing the top WhatsApp chatbot platforms for e-commerce businesses. We analyze Flowauxi, Wati, Interakt, and others on features, pricing, ease of use, and India-specific capabilities.",
    category: "Comparison",
    readTime: "10 min read",
    icon: <MessageSquare className="h-5 w-5" />,
    keywords: [
      "best WhatsApp chatbot for e-commerce",
      "WhatsApp chatbot comparison",
      "Flowauxi vs Wati",
    ],
    color: "from-blue-500 to-cyan-600",
  },
  {
    slug: "whatsapp-crm-vs-traditional-crm",
    title:
      "WhatsApp CRM vs Traditional CRM: Which Is Better for E-commerce?",
    excerpt:
      "Traditional CRMs weren't built for WhatsApp-first businesses. Learn why WhatsApp CRM platforms like Flowauxi offer better engagement, higher conversion rates, and seamless customer management for modern online sellers.",
    category: "Analysis",
    readTime: "7 min read",
    icon: <Zap className="h-5 w-5" />,
    keywords: [
      "WhatsApp CRM vs traditional CRM",
      "WhatsApp CRM for e-commerce",
      "customer management WhatsApp",
    ],
    color: "from-purple-500 to-pink-600",
  },
];

export default function BlogIndexPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="w-full bg-white/80 backdrop-blur-xl border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2">
              <img
                src="/logo.png"
                alt="Flowauxi Logo"
                className="h-8 w-8 object-contain"
              />
              <span className="text-xl font-bold text-gray-900">
                Flowauxi
              </span>
              <span className="text-sm text-gray-400 ml-1">/ Blog</span>
            </Link>
            <Link
              href="/signup"
              className="bg-gray-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-black transition-colors shadow-lg"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Blog Header */}
      <section className="py-16 bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            WhatsApp Automation Blog
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Expert guides, tutorials, and insights on WhatsApp automation
            for e-commerce, business messaging, and customer engagement.
          </p>
        </div>
      </section>

      {/* Articles */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="space-y-8">
            {blogArticles.map((article) => (
              <article
                key={article.slug}
                className="group bg-white border border-gray-200 rounded-2xl p-8 hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`inline-flex p-2 rounded-lg bg-gradient-to-br ${article.color} text-white shadow-md`}
                  >
                    {article.icon}
                  </div>
                  <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                    {article.category}
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="flex items-center gap-1 text-sm text-gray-500">
                    <Clock className="h-3.5 w-3.5" />
                    {article.readTime}
                  </span>
                </div>

                <h2 className="text-2xl font-bold text-gray-900 mb-3 group-hover:text-indigo-600 transition-colors">
                  {article.title}
                </h2>

                <p className="text-gray-600 leading-relaxed mb-4">
                  {article.excerpt}
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-2">
                    {article.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                  <span className="inline-flex items-center gap-1 text-indigo-600 font-medium text-sm group-hover:gap-2 transition-all">
                    Coming soon
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Ready to Automate Your WhatsApp?
          </h2>
          <p className="text-lg text-gray-600 mb-6">
            Start your 14-day free trial and see WhatsApp automation in
            action.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-gray-900 text-white px-8 py-4 rounded-xl font-semibold hover:bg-black transition-colors shadow-xl text-lg"
            >
              Start Free Trial
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="https://shop.flowauxi.com"
              className="inline-flex items-center gap-2 text-gray-700 font-medium hover:text-gray-900 transition-colors text-lg"
            >
              Build Your WhatsApp Store →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm">
          <p>
            © 2026 Flowauxi Technologies. All rights reserved. |{" "}
            <Link
              href="/privacy"
              className="hover:text-white transition-colors"
            >
              Privacy
            </Link>{" "}
            |{" "}
            <Link
              href="/terms"
              className="hover:text-white transition-colors"
            >
              Terms
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
