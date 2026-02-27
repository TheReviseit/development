import Link from "next/link";
import {
  Star,
  ArrowRight,
  Users,
  Trophy,
  TrendingUp,
  Zap,
  Layout,
  Palette,
  Globe,
  Shield,
  Sparkles,
  Activity,
  Target,
  Lock,
} from "lucide-react";
import styles from "./showcase.module.css";

/**
 * Showcase Landing Page - Exact Bento Box Layout
 * Top: Centered title, subtitle, buttons, rating
 * Bottom: Hero image (left) | Bento cards (right)
 */

export default function ShowcaseLandingPage() {
  return (
    <div className={styles.container}>
      {/* Navigation */}
      <nav className={styles.navbar}>
        <div className={styles.navbarInner}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>F</div>
            <span>Flowauxi</span>
          </div>
          <div className={styles.navLinks}>
            <Link href="/" className={styles.navLink}>
              Home
            </Link>
            <Link href="#features" className={styles.navLink}>
              Features
            </Link>
            <Link href="/pricing" className={styles.navLink}>
              Pricing
            </Link>
            <Link href="#contact" className={styles.navLink}>
              Contact
            </Link>
            <Link href="/signup" className={styles.navCta}>
              Sign Up
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContainer}>
          {/* Top Section - Centered Title, Subtitle, Buttons, Rating */}
          <div className={styles.heroTopSection}>
            <h1 className={styles.heroTitle}>
              The Future of Portfolio
              <br />
              with Latest Technology
            </h1>
            <p className={styles.heroSubtitle}>
              Expert tech to elevate your portfolio. Let&apos;s take your
              business further with stunning showcase websites and powerful
              customization tools.
            </p>
            <div className={styles.heroButtons}>
              <Link href="/signup" className={styles.primaryButton}>
                Get Started
              </Link>
              <Link href="#demo" className={styles.secondaryButton}>
                Try Demo
              </Link>
            </div>
            <div className={styles.heroRating}>
              <div className={styles.stars}>
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={18} fill="currentColor" />
                ))}
              </div>
              <div className={styles.ratingText}>
                <span className={styles.ratingScore}>5.0</span> from 80+ reviews
              </div>
            </div>
          </div>

          {/* Bottom Section - Hero Image (left) + Bento Cards (right) */}
          <div className={styles.heroBottomSection}>
            {/* Left: Hero Image with Decorative Icons */}
            <div className={styles.heroImageColumn}>
              {/* Decorative floating icons */}
              <div className={styles.decorativeIcons}>
                <div className={styles.decorIcon}>
                  <Target size={18} />
                </div>
                <div className={styles.decorIcon}>
                  <Activity size={18} />
                </div>
                <div className={styles.decorIcon}>
                  <Lock size={18} />
                </div>
              </div>

              {/* Hero Image */}
              <div className={styles.heroImage}>
                <img
                  src="https://images.unsplash.com/photo-1511818966892-d7d671e672a2?w=500&h=500&fit=crop&sat=20"
                  alt="Modern architectural design showcase"
                />
              </div>
            </div>

            {/* Right: Bento Box Cards */}
            <div className={`${styles.bentoGrid} ${styles.bentoGridAlt}`}>
              {/* Card 1: Left Tall - Clients */}
              <div
                className={`${styles.bentoCard} ${styles.cardTeal} ${styles.bentoCard1Alt}`}
              >
                <div className={styles.cardIcon}>
                  <Users size={20} />
                </div>
                <div>
                  <div className={styles.cardNumber}>100+</div>
                  <div className={styles.cardLabel}>
                    Our Extended Clients and Partners
                  </div>
                </div>
              </div>

              {/* Card 2: Top Center - Total Projects */}
              <div
                className={`${styles.bentoCard} ${styles.cardMint} ${styles.bentoCard2Alt}`}
              >
                <div className={styles.cardIcon}>
                  <Trophy size={20} />
                </div>
                <div>
                  <div className={styles.cardLabel}>Total Projects</div>
                  <div className={styles.cardNumber}>1951+</div>
                  <div
                    className={`${styles.cardLabel} ${styles.cardSmallText}`}
                  >
                    Increase of 2% this month
                  </div>
                </div>
              </div>

              {/* Card 3: Bottom Center - Years */}
              <div
                className={`${styles.bentoCard} ${styles.cardMint} ${styles.bentoCard3Alt}`}
              >
                <div className={styles.cardIcon}>
                  <TrendingUp size={20} />
                </div>
                <div>
                  <div className={styles.cardNumber}>6+</div>
                  <div className={styles.cardLabel}>
                    Years of Dedicated Service
                  </div>
                </div>
              </div>

              {/* Card 4: Right Tall - Efficiency */}
              <div
                className={`${styles.bentoCard} ${styles.cardTeal} ${styles.bentoCard4Alt}`}
              >
                <div className={styles.cardIcon}>
                  <Zap size={20} />
                </div>
                <div>
                  <div className={styles.cardLabel}>
                    Achieved Optimal Efficiency and Boost Productivity
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className={styles.features} id="features">
        <div className={styles.featuresContent}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              Built for Creators and Professionals
            </h2>
            <p className={styles.sectionSubtitle}>
              Everything you need to showcase your work beautifully with
              cutting-edge technology
            </p>
          </div>

          <div className={styles.featuresGrid}>
            <FeatureCard
              icon={<Layout size={28} />}
              title="Visual Builder"
              description="Intuitive drag-and-drop interface with real-time preview. Create professional portfolios in minutes."
            />
            <FeatureCard
              icon={<Palette size={28} />}
              title="Premium Templates"
              description="50+ professionally designed templates for every industry. Fully customizable to match your brand."
            />
            <FeatureCard
              icon={<Globe size={28} />}
              title="Global Reach"
              description="Multi-language support, CDN delivery, and SEO optimization to reach audiences worldwide."
            />
            <FeatureCard
              icon={<Shield size={28} />}
              title="Enterprise Security"
              description="Bank-level encryption, SSL certificates, and automatic backups to keep your data safe."
            />
            <FeatureCard
              icon={<Sparkles size={28} />}
              title="AI-Powered"
              description="Smart content suggestions, auto-optimization, and intelligent analytics to maximize impact."
            />
            <FeatureCard
              icon={<TrendingUp size={28} />}
              title="Analytics & Insights"
              description="Advanced visitor tracking, conversion metrics, and actionable insights to grow your audience."
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.cta}>
        <div className={styles.ctaContent}>
          <h2 className={styles.ctaTitle}>
            Build Your Professional Portfolio Today
          </h2>
          <p className={styles.ctaSubtitle}>
            Join thousands of creators and professionals showcasing their work
            with Flowauxi&apos;s cutting-edge platform
          </p>
          <Link href="/signup" className={styles.ctaButton}>
            Start Free Trial
            <ArrowRight size={22} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div className={styles.footerLogo}>Flowauxi Showcase</div>
          <p className={styles.footerText}>
            Professional portfolio platform built for creators
          </p>
          <p className={styles.footerText}>
            &copy; 2026 Flowauxi. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

// Feature Card Component
function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className={styles.featureCard}>
      <div className={styles.featureIcon}>{icon}</div>
      <h3 className={styles.featureTitle}>{title}</h3>
      <p className={styles.featureDescription}>{description}</p>
    </div>
  );
}
