"use client";

import Link from "next/link";
import {
  Bot,
  ShoppingCart,
  CreditCard,
  Users,
  ArrowRight,
  Check,
  Zap,
} from "lucide-react";
import { motion, Variants } from "framer-motion";
import styles from "./ShopBridgeSection.module.css";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 20,
    },
  },
};

const features = [
  {
    icon: Bot,
    title: "AI-Powered WhatsApp Chatbot",
    description:
      "24/7 intelligent conversations that handle product inquiries, process orders, and resolve customer issues. Trained on your catalog for accurate, contextual responses.",
  },
  {
    icon: ShoppingCart,
    title: "Automated Order Booking",
    description:
      "Customers place orders directly through WhatsApp chat. AI confirms quantities, calculates totals, generates invoices, and sends payment links — zero manual work.",
  },
  {
    icon: Users,
    title: "WhatsApp CRM & Customer Data",
    description:
      "Automatically capture customer data from conversations. Track order history, segment audiences, and personalize follow-up messages for higher retention.",
  },
  {
    icon: CreditCard,
    title: "WhatsApp Payments Integration",
    description:
      "Automatic invoice generation and payment link delivery via WhatsApp. Supports UPI, credit cards, and net banking. Payment confirmations sent instantly.",
  },
];

const stats = [
  { value: "500+", label: "BUSINESSES", suffix: "Trusted" },
  { value: "10k+", label: "ORDERS PROCESSED", suffix: "Monthly" },
  { value: "98%", label: "DELIVERY RATE", suffix: "Guaranteed" },
];

export default function ShopBridgeSection() {
  return (
    <section className={styles.section}>
      <div className={styles.sectionInner}>
        
        {/* Header */}
        <motion.div
          className={styles.header}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
        >
          <motion.div className={styles.badge} variants={itemVariants}>
            <Zap className="h-4 w-4" />
            <span>Enterprise WhatsApp Commerce</span>
          </motion.div>
          
          <motion.h2 className={styles.title} variants={itemVariants}>
            WhatsApp Automation for{" "}
            <span className={styles.titleAccent}>
              E-commerce Businesses
            </span>
          </motion.h2>
          
          <motion.p className={styles.subtitle} variants={itemVariants}>
            Build a complete WhatsApp-powered store with enterprise features
            designed to automate your sales, streamline operations, and scale
            your business — no coding required.
          </motion.p>
        </motion.div>

        {/* Features Bento Grid */}
        <motion.div
          className={styles.featuresGrid}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={containerVariants}
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              className={styles.featureCard}
              variants={itemVariants}
            >
              <div className={styles.featureHeader}>
                <div className={styles.featureIcon}>
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className={styles.featureTitle}>{feature.title}</h3>
              </div>
              <p className={styles.featureDesc}>{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Stats Row */}
        <motion.div
          className={styles.statsGrid}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={containerVariants}
        >
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              className={styles.statCard}
              variants={itemVariants}
            >
              <div className={styles.statValue}>{stat.value}</div>
              <div className={styles.statLabel}>{stat.label}</div>
              <div className={styles.statSuffix}>{stat.suffix}</div>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA Section */}
        <motion.div
          className={styles.ctaSection}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
        >
          <div className={styles.ctaContent}>
            <h3 className={styles.ctaTitle}>
              Ready to Start Your WhatsApp Store?
            </h3>
            <p className={styles.ctaDesc}>
              Join 500+ businesses selling on WhatsApp. Start your free trial
              today — no credit card required.
            </p>
            
            <div className={styles.ctaButtons}>
              <Link
                href="/signup"
                className={styles.ctaButtonPrimary}
              >
                Start Now
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                href="/pricing"
                className={styles.ctaButtonSecondary}
              >
                View Pricing
              </Link>
            </div>
            
            <div className={styles.ctaTags}>
              <span className={styles.ctaTag}>
                <Check className={styles.ctaTagIcon} />
                14-day free trial
              </span>
              <span className={styles.ctaTag}>
                <Check className={styles.ctaTagIcon} />
                No credit card
              </span>
              <span className={styles.ctaTag}>
                <Check className={styles.ctaTagIcon} />
                WhatsApp Business API
              </span>
            </div>
          </div>
        </motion.div>

        {/* Trust Indicators */}
        <motion.div
          className={styles.trustSection}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          <p className={styles.trustText}>
            Trusted by 500+ e-commerce businesses across India
          </p>
          <div className={styles.trustStars}>
            {[...Array(5)].map((_, i) => (
              <svg
                key={i}
                className={styles.star}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
            <span className={styles.trustRating}>4.8/5 rating</span>
          </div>
        </motion.div>

        {/* Structured Data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "What is the best WhatsApp e-commerce platform?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Flowauxi Shop is the best WhatsApp e-commerce platform for businesses in India. It offers AI-powered chatbots, automated order booking, WhatsApp CRM, and payment integration — all designed to help businesses sell products directly through WhatsApp.",
                  },
                },
                {
                  "@type": "Question",
                  name: "How do I automate WhatsApp orders for my online store?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "With Flowauxi Shop, connect your store to the WhatsApp Business API. Once connected, the AI chatbot handles incoming order requests, shares your product catalog, confirms orders, generates invoices, and sends automatic payment links — all through WhatsApp.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Can I build a WhatsApp store for my business?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes! Flowauxi Shop lets you create a professional WhatsApp-powered online store with automated order booking. Customers can browse products, place orders via WhatsApp, and receive real-time order updates — no coding required.",
                  },
                },
                {
                  "@type": "Question",
                  name: "What is WhatsApp conversational commerce?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "WhatsApp conversational commerce is the practice of selling products and services directly through WhatsApp chat. With Flowauxi Shop, businesses share product catalogs, accept orders, process payments, and provide customer support — all within WhatsApp conversations.",
                  },
                },
              ],
            }),
          }}
        />
      </div>
    </section>
  );
}
