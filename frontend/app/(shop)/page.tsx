import Link from "next/link";
import {
  ShoppingBag,
  BarChart3,
  Zap,
  Shield,
  MessageSquare,
  Package,
  ArrowRight,
  Check,
  TrendingUp,
  Clock,
  Lock,
  Sparkles,
  Users,
  Globe,
} from "lucide-react";

/**
 * Shop Product Landing Page - Enterprise Grade
 * Domain: shop.flowauxi.com
 * Standard: Google/Zoho Level Design
 */

export default function ShopLandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2 group">
              <div className="relative">
                <ShoppingBag className="h-8 w-8 text-indigo-600 transition-transform group-hover:scale-110 duration-300" />
                <div className="absolute -inset-2 bg-indigo-600/20 rounded-full blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
              <span className="ml-2 text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Flowauxi Shop
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
                className="relative group overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-2 rounded-xl font-medium transition-all duration-300 shadow-lg hover:shadow-xl hover:shadow-indigo-500/50 hover:-translate-y-0.5"
              >
                <span className="relative z-10">Start Free Trial</span>
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-32 pb-24 md:pt-40 md:pb-32">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse-slow animation-delay-2000" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 bg-indigo-100/80 backdrop-blur-sm text-indigo-700 px-4 py-2 rounded-full text-sm font-medium mb-6 border border-indigo-200/50">
                <Sparkles className="h-4 w-4" />
                <span>Trusted by 10,000+ businesses worldwide</span>
              </div>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-gray-900 leading-tight mb-6">
                Commerce Platform
                <span className="block bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent animate-gradient">
                  Built for Scale
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-600 mb-8 leading-relaxed">
                Enterprise-grade commerce infrastructure with{" "}
                <span className="font-semibold text-indigo-600">
                  AI-powered automation
                </span>
                , real-time analytics, and seamless WhatsApp integration.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-10">
                <Link
                  href="/signup"
                  className="group relative inline-flex items-center justify-center bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-xl hover:from-indigo-700 hover:to-purple-700 font-semibold transition-all duration-300 shadow-xl hover:shadow-2xl hover:shadow-indigo-500/50 hover:-translate-y-1 text-lg overflow-hidden"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Start Free Trial
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                </Link>
                <Link
                  href="/demo"
                  className="group inline-flex items-center justify-center bg-white/80 backdrop-blur-sm border-2 border-gray-200 text-gray-700 px-8 py-4 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/50 font-semibold transition-all duration-300 text-lg hover:shadow-lg"
                >
                  Watch Demo
                </Link>
              </div>
              <div className="flex items-center gap-6 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-600" />
                  <span>14-day free trial</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-600" />
                  <span>No credit card</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5 text-green-600" />
                  <span>Cancel anytime</span>
                </div>
              </div>
            </div>

            {/* Hero Illustration */}
            <div className="relative animate-float">
              <div className="relative bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 rounded-3xl p-8 backdrop-blur-sm border border-white/20 shadow-2xl">
                <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl">
                  <div className="space-y-4">
                    {/* Dashboard Preview */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                          <BarChart3 className="h-6 w-6 text-white" />
                        </div>
                        <div>
                          <div className="text-sm text-gray-500">
                            Revenue Today
                          </div>
                          <div className="text-2xl font-bold text-gray-900">
                            $24,567
                          </div>
                        </div>
                      </div>
                      <div className="text-green-600 text-sm font-semibold flex items-center gap-1">
                        <TrendingUp className="h-4 w-4" />
                        +23%
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-4 pt-4">
                      <StatCard
                        icon={<Package className="h-5 w-5" />}
                        label="Orders"
                        value="1,234"
                        color="from-blue-500 to-cyan-500"
                      />
                      <StatCard
                        icon={<Users className="h-5 w-5" />}
                        label="Customers"
                        value="5.6k"
                        color="from-purple-500 to-pink-500"
                      />
                      <StatCard
                        icon={<Globe className="h-5 w-5" />}
                        label="Visitors"
                        value="12.3k"
                        color="from-orange-500 to-red-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 bg-white relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Zap className="h-4 w-4" />
              <span>All-in-One Platform</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Everything You Need to Run Commerce
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Enterprise-grade tools designed for efficiency, scalability, and
              exponential growth
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={<BarChart3 className="h-8 w-8" />}
              title="Smart Dashboard"
              description="Real-time insights into orders, revenue, and customer behavior. Make data-driven decisions instantly."
              gradient="from-indigo-500 to-purple-600"
            />
            <FeatureCard
              icon={<Package className="h-8 w-8" />}
              title="Product Management"
              description="Intuitive catalog management with bulk operations, variants, and automated inventory tracking."
              gradient="from-blue-500 to-cyan-600"
            />
            <FeatureCard
              icon={<ShoppingBag className="h-8 w-8" />}
              title="Orders & Fulfillment"
              description="Streamlined order processing with automated workflows, shipping integration, and status tracking."
              gradient="from-purple-500 to-pink-600"
            />
            <FeatureCard
              icon={<Zap className="h-8 w-8" />}
              title="AI Automation"
              description="Intelligent automation for pricing, inventory, and customer communication. Reduce manual work by 80%."
              gradient="from-orange-500 to-red-600"
            />
            <FeatureCard
              icon={<MessageSquare className="h-8 w-8" />}
              title="WhatsApp Commerce"
              description="Native WhatsApp integration for orders, customer support, and automated notifications."
              gradient="from-green-500 to-emerald-600"
            />
            <FeatureCard
              icon={<TrendingUp className="h-8 w-8" />}
              title="Advanced Analytics"
              description="Comprehensive reporting with cohort analysis, revenue forecasting, and customer lifetime value."
              gradient="from-violet-500 to-purple-600"
            />
          </div>
        </div>
      </section>

      {/* Product Demo Section */}
      <section className="py-24 bg-gradient-to-br from-gray-50 to-indigo-50/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                Built for Modern
                <span className="block bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Commerce Operations
                </span>
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Our platform combines powerful automation with intuitive design,
                giving you complete control while eliminating repetitive tasks.
              </p>
              <ul className="space-y-4">
                <BenefitItem text="Process orders 10x faster with automated workflows" />
                <BenefitItem text="Reduce manual data entry by 90% with AI-powered automation" />
                <BenefitItem text="Scale to 100k+ SKUs without performance degradation" />
                <BenefitItem text="Integrate with existing tools via REST API and webhooks" />
              </ul>
            </div>
            <div className="relative">
              <div className="relative bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 rounded-3xl p-8 backdrop-blur-sm border border-white/20 shadow-2xl">
                <div className="aspect-video bg-white/90 backdrop-blur-xl rounded-2xl flex items-center justify-center shadow-xl">
                  <Package className="h-32 w-32 text-indigo-300" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Launch in Minutes, Not Months
            </h2>
            <p className="text-xl text-gray-600">
              Three simple steps to start selling
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              number="1"
              title="Sign Up"
              description="Create your account in seconds. No credit card required for the 14-day free trial."
            />
            <StepCard
              number="2"
              title="Add Products"
              description="Import your catalog via CSV, API, or manual entry. Bulk operations supported."
            />
            <StepCard
              number="3"
              title="Start Selling"
              description="Go live immediately. Orders, payments, and fulfillment handled automatically."
            />
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-24 bg-gradient-to-br from-gray-50 to-indigo-50/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-12">
            <TrustCard
              icon={<Shield className="h-12 w-12" />}
              title="Enterprise Security"
              description="Bank-level encryption, SOC 2 compliance, and regular security audits. Your data is protected."
              gradient="from-green-500 to-emerald-600"
            />
            <TrustCard
              icon={<Clock className="h-12 w-12" />}
              title="99.9% Uptime"
              description="Multi-region infrastructure with automatic failover. We guarantee your store stays online."
              gradient="from-blue-500 to-cyan-600"
            />
            <TrustCard
              icon={<Lock className="h-12 w-12" />}
              title="Built to Scale"
              description="Handle millions of products and orders without performance degradation. Grow without limits."
              gradient="from-purple-500 to-pink-600"
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600" />
        <div className="absolute inset-0 bg-grid-pattern-white opacity-10" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
            Launch Your Store Today
          </h2>
          <p className="text-xl md:text-2xl text-indigo-100 mb-10">
            Join thousands of businesses running their commerce operations on
            Flowauxi
          </p>
          <Link
            href="/signup"
            className="group inline-flex items-center justify-center bg-white text-indigo-600 px-10 py-5 rounded-xl hover:bg-gray-50 font-bold transition-all duration-300 shadow-2xl hover:shadow-3xl hover:-translate-y-1 text-lg"
          >
            <span className="flex items-center gap-2">
              Start Free Trial
              <ArrowRight className="h-6 w-6 group-hover:translate-x-1 transition-transform duration-300" />
            </span>
          </Link>
          <p className="mt-6 text-indigo-200 text-sm">
            14-day free trial • No credit card required • Cancel anytime
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center mb-4">
                <ShoppingBag className="h-6 w-6 text-indigo-400" />
                <span className="ml-2 text-white font-semibold text-lg">
                  Flowauxi Shop
                </span>
              </div>
              <p className="text-sm">
                Enterprise commerce platform built for modern businesses
              </p>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Product</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    href="/features"
                    className="hover:text-white transition-colors"
                  >
                    Features
                  </Link>
                </li>
                <li>
                  <Link
                    href="/pricing"
                    className="hover:text-white transition-colors"
                  >
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link
                    href="/demo"
                    className="hover:text-white transition-colors"
                  >
                    Demo
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Resources</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    href="/docs"
                    className="hover:text-white transition-colors"
                  >
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link
                    href="/api"
                    className="hover:text-white transition-colors"
                  >
                    API Reference
                  </Link>
                </li>
                <li>
                  <Link
                    href="/support"
                    className="hover:text-white transition-colors"
                  >
                    Support
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link
                    href="/about"
                    className="hover:text-white transition-colors"
                  >
                    About
                  </Link>
                </li>
                <li>
                  <Link
                    href="/security"
                    className="hover:text-white transition-colors"
                  >
                    Security
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="hover:text-white transition-colors"
                  >
                    Privacy
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm">
            <p>&copy; 2026 Flowauxi. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================================================
// REUSABLE COMPONENTS
// ============================================================================

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-gradient-to-br from-gray-50 to-white p-4 rounded-xl border border-gray-100 hover:shadow-md transition-shadow duration-300">
      <div
        className={`w-10 h-10 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-white mb-2 shadow-lg`}
      >
        {icon}
      </div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold text-gray-900">{value}</div>
    </div>
  );
}

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
    <div className="group relative bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl p-8 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 hover:-translate-y-2 overflow-hidden">
      {/* Gradient overlay on hover */}
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

function BenefitItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-3 group">
      <div className="flex-shrink-0 mt-0.5">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
          <Check className="h-4 w-4 text-white" />
        </div>
      </div>
      <span className="text-gray-700 text-lg leading-relaxed">{text}</span>
    </li>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center group">
      <div className="relative inline-flex items-center justify-center w-20 h-20 mb-6">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl rotate-6 group-hover:rotate-12 transition-transform duration-300 shadow-xl" />
        <div className="relative bg-gradient-to-br from-indigo-600 to-purple-600 w-full h-full rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg">
          {number}
        </div>
      </div>
      <h3 className="text-2xl font-bold text-gray-900 mb-4">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}

function TrustCard({
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
    <div className="text-center group">
      <div className="relative inline-flex items-center justify-center mb-6">
        <div
          className={`absolute inset-0 bg-gradient-to-br ${gradient} rounded-2xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity duration-300`}
        />
        <div
          className={`relative bg-gradient-to-br ${gradient} p-4 rounded-2xl text-white shadow-xl group-hover:scale-110 transition-transform duration-300`}
        >
          {icon}
        </div>
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-4">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
}
