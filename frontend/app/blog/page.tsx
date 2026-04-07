import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog | WhatsApp E-commerce Guides, Tips & Best Practices",
  description: "Learn how to sell on WhatsApp, automate orders, and grow your e-commerce business. Expert guides on WhatsApp commerce, AI chatbots, and D2C selling in India.",
  keywords: [
    "WhatsApp e-commerce blog",
    "sell on WhatsApp guide",
    "WhatsApp business tips",
    "D2C selling India",
    "WhatsApp automation tutorials",
    "e-commerce best practices",
  ],
  openGraph: {
    title: "Flowauxi Blog | WhatsApp E-commerce Guides",
    description: "Expert guides on WhatsApp commerce, AI chatbots, and D2C selling in India.",
    url: "https://www.flowauxi.com/blog",
    type: "website",
  },
  alternates: { canonical: "https://www.flowauxi.com/blog" },
};

const BLOG_POSTS = [
  {
    slug: "what-is-whatsapp-ecommerce",
    title: "What is WhatsApp E-commerce? Complete Guide 2026",
    excerpt: "Learn what WhatsApp e-commerce is, how it works, and why businesses in India are using WhatsApp to sell products.",
    category: "Getting Started",
    readTime: "8 min",
    date: "2026-01-15",
    featured: true,
  },
  {
    slug: "how-to-sell-on-whatsapp",
    title: "How to Sell on WhatsApp Without a Website",
    excerpt: "Step-by-step guide to setting up your WhatsApp store, collecting payments, and automating orders — all without building a website.",
    category: "Tutorial",
    readTime: "12 min",
    date: "2026-01-20",
    featured: true,
  },
  {
    slug: "whatsapp-order-automation",
    title: "WhatsApp Order Automation: Complete Guide",
    excerpt: "Learn how to automate order booking, confirmations, tracking, and invoicing on WhatsApp. Reduce manual work by 80%.",
    category: "Automation",
    readTime: "10 min",
    date: "2026-01-25",
    featured: false,
  },
  {
    slug: "best-whatsapp-chatbot-ecommerce",
    title: "Best WhatsApp Chatbot for E-commerce: 2026 Comparison",
    excerpt: "Compare Flowauxi, Wati, Interakt, and Dukaan. Find the right WhatsApp chatbot for your e-commerce store.",
    category: "Comparison",
    readTime: "15 min",
    date: "2026-02-01",
    featured: false,
  },
];

const CATEGORIES = [
  { name: "Getting Started", count: 1, description: "New to WhatsApp e-commerce? Start here." },
  { name: "Tutorial", count: 1, description: "Step-by-step guides and tutorials." },
  { name: "Automation", count: 1, description: "Automate your WhatsApp business." },
  { name: "Comparison", count: 1, description: "Platform and tool comparisons." },
];

export default function BlogIndexPage() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-16">
      <nav className="text-sm text-gray-500 mb-8">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Blog</span>
      </nav>

      <header className="mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          WhatsApp E-commerce Blog
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl">
          Expert guides on selling on WhatsApp, automating orders, and growing your D2C business in India.
          Updated weekly with actionable tips and strategies.
        </p>
      </header>

      {/* Featured Posts */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Featured Articles</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {BLOG_POSTS.filter((post) => post.featured).map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group block border border-gray-200 rounded-lg overflow-hidden hover:border-green-500 hover:shadow-lg transition-all"
            >
              <div className="p-6">
                <span className="text-xs font-semibold text-green-600 uppercase tracking-wider">
                  {post.category}
                </span>
                <h3 className="text-xl font-bold text-gray-900 mt-2 group-hover:text-green-600">
                  {post.title}
                </h3>
                <p className="text-gray-600 mt-2">{post.excerpt}</p>
                <div className="flex items-center gap-4 mt-4 text-sm text-gray-500">
                  <span>{post.readTime} read</span>
                  <span>•</span>
                  <span>{new Date(post.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Browse by Category</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {CATEGORIES.map((category) => (
            <div
              key={category.name}
              className="border border-gray-200 rounded-lg p-4 hover:border-green-500 transition-colors"
            >
              <h3 className="font-semibold text-gray-900">{category.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{category.description}</p>
              <span className="text-xs text-green-600 mt-2 inline-block">{category.count} article{category.count !== 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
      </section>

      {/* All Posts */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">All Articles</h2>
        <div className="space-y-4">
          {BLOG_POSTS.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group block border border-gray-200 rounded-lg p-6 hover:border-green-500 hover:shadow-md transition-all"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                  <span className="text-xs font-semibold text-green-600 uppercase tracking-wider">
                    {post.category}
                  </span>
                  <h3 className="text-lg font-bold text-gray-900 mt-1 group-hover:text-green-600">
                    {post.title}
                  </h3>
                  <p className="text-gray-600 mt-1 text-sm">{post.excerpt}</p>
                </div>
                <div className="flex items-center gap-4 mt-4 md:mt-0 text-sm text-gray-500">
                  <span>{post.readTime}</span>
                  <span>•</span>
                  <span>{new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mt-16 bg-green-600 text-white rounded-lg p-8 text-center">
        <h2 className="text-2xl font-bold mb-4">Ready to Start Selling on WhatsApp?</h2>
        <p className="mb-6 text-green-100">
          Flowauxi gives you AI chatbot, store builder, order automation, and payments — all free to start.
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
    </main>
  );
}