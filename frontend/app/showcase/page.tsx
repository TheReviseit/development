import Link from "next/link";
import {
  Eye,
  Sparkles,
  Image as ImageIcon,
  ArrowRight,
  Check,
  Palette,
  Star,
  TrendingUp,
  Layout,
  Share2,
} from "lucide-react";

/**
 * Showcase Product Landing Page - Enterprise Grade
 * Domain: showcase.flowauxi.com
 * Port: localhost:3003
 */

export default function ShowcaseLandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-amber-50">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2 group">
              <div className="relative">
                <Eye className="h-8 w-8 text-amber-600 transition-transform group-hover:scale-110 duration-300" />
                <div className="absolute -inset-2 bg-amber-600/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
              <span className="ml-2 text-xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                Flowauxi Showcase
              </span>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors duration-200"
              >
                Sign In
              </Link>
              <Link
                href="/signup"
                className="relative group overflow-hidden bg-gradient-to-r from-amber-600 to-orange-600 text-white px-6 py-2 rounded-xl font-medium transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-amber-500/50 hover:-translate-y-0.5"
              >
                <span className="relative z-10">Start Free Trial</span>
                <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-amber-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-24 md:pt-40 md:pb-32">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl animate-pulse-slow animation-delay-2000" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-amber-100/80 backdrop-blur-sm text-amber-700 px-4 py-2 rounded-full text-sm font-medium mb-6 border border-amber-200/50">
              <Sparkles className="h-4 w-4" />
              <span>Powering 15,000+ portfolio websites worldwide</span>
            </div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight mb-6">
              Showcase Your Work
              <span className="block bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 bg-clip-text text-transparent animate-gradient">
                Like a Pro
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 mb-8 leading-relaxed">
              Create stunning portfolio websites with{" "}
              <span className="font-semibold text-amber-600">
                drag-and-drop builder
              </span>
              , beautiful templates, and powerful customization.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
              <Link
                href="/signup"
                className="group relative inline-flex items-center justify-center bg-gradient-to-r from-amber-600 to-orange-600 text-white px-8 py-4 rounded-xl hover:from-amber-700 hover:to-orange-700 font-semibold transition-all duration-300 shadow-xl hover:shadow-2xl hover:shadow-amber-500/50 hover:-translate-y-1 text-lg overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Start Free Trial
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-orange-600 to-rose-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Link>
              <Link
                href="/demo"
                className="group inline-flex items-center justify-center bg-white/80 backdrop-blur-sm border-2 border-gray-200 text-gray-700 px-8 py-4 rounded-xl hover:border-amber-300 hover:bg-amber-50/50 font-semibold transition-all duration-300 text-lg hover:shadow-lg"
              >
                View Examples
              </Link>
            </div>
            <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-600" />
                <span>Free forever plan</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-600" />
                <span>No credit card</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-5 w-5 text-green-600" />
                <span>Custom domain</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Built for Creators and Professionals
            </h2>
            <p className="text-xl text-gray-600">
              Everything you need to showcase your work beautifully
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Layout className="h-8 w-8" />}
              title="Drag & Drop Builder"
              description="Intuitive visual builder with real-time preview. No coding required. Create professional sites in minutes."
              gradient="from-amber-500 to-orange-600"
            />
            <FeatureCard
              icon={<Palette className="h-8 w-8" />}
              title="Beautiful Templates"
              description="50+ professionally designed templates for every industry. Fully customizable to match your brand."
              gradient="from-blue-500 to-cyan-600"
            />
            <FeatureCard
              icon={<ImageIcon className="h-8 w-8" />}
              title="Media Showcase"
              description="Display images, videos, and documents beautifully. Optimized galleries with lightbox support."
              gradient="from-purple-500 to-pink-600"
            />
            <FeatureCard
              icon={<Star className="h-8 w-8" />}
              title="Client Testimonials"
              description="Showcase reviews and testimonials. Build trust with social proof and ratings."
              gradient="from-green-500 to-emerald-600"
            />
            <FeatureCard
              icon={<Share2 className="h-8 w-8" />}
              title="Social Integration"
              description="Connect Instagram, Behance, Dribbble, and more. Auto-sync your latest work."
              gradient="from-violet-500 to-purple-600"
            />
            <FeatureCard
              icon={<TrendingUp className="h-8 w-8" />}
              title="Analytics & SEO"
              description="Track visitors, optimize for search engines, and grow your audience with built-in tools."
              gradient="from-pink-500 to-rose-600"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-600 via-orange-600 to-rose-600" />
        <div className="absolute inset-0 bg-grid-pattern-white opacity-10" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
            Build Your Portfolio Today
          </h2>
          <p className="text-xl md:text-2xl text-amber-100 mb-10">
            Join thousands of creators showcasing their work with Flowauxi
          </p>
          <Link
            href="/signup"
            className="group inline-flex items-center justify-center bg-white text-amber-600 px-10 py-5 rounded-xl hover:bg-gray-50 font-bold transition-all duration-300 shadow-2xl hover:shadow-3xl hover:-translate-y-1 text-lg"
          >
            <span className="flex items-center gap-2">
              Start Free Trial
              <ArrowRight className="h-6 w-6 group-hover:translate-x-1 transition-transform duration-300" />
            </span>
          </Link>
          <p className="mt-6 text-amber-200 text-sm">
            Free forever plan • No credit card required • Upgrade anytime
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center mb-4">
            <Eye className="h-6 w-6 text-amber-400" />
            <span className="ml-2 text-white font-semibold text-lg">
              Flowauxi Showcase
            </span>
          </div>
          <p className="text-sm">
            Portfolio platform built for creators and professionals
          </p>
          <div className="mt-8 text-sm">
            <p>&copy; 2026 Flowauxi. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Reusable Component
function FeatureCard({
  icon,
  title,
  description,
  gradient,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
}) {
  return (
    <div className="group relative bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-8 hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-500 hover:-translate-y-2 overflow-hidden">
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500`}
      />
      <div className="relative z-10">
        <div
          className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${gradient} text-white mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}
        >
          {icon}
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
        <p className="text-gray-600 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
