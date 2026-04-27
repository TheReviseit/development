# FLOWAUXI SEO PHASE 1 — PRODUCTION-GRADE IMPLEMENTATION PLAN

## Overview

This plan covers the highest-impact SEO changes to rank #1 for "online store builder", "free website builder", "ecommerce website builder", "whatsapp store builder", and "create online store free". Every change includes exact file paths, before/after content, and rationale.

**Total target search volume: 54,000+ monthly Indian searches currently with ZERO dedicated pages.**

---

## TASK 1: Fix Shop Hero H1 — CRITICAL SEO FIX

### Problem
`shop.flowauxi.com` has H1 "Boost your sales with Smart Commerce" — this tells Google NOTHING about "online store builder" or "whatsapp store builder". The #1 ranking signal is the H1 tag containing the target keyword.

### File: `frontend/app/(shop)/components/ShopHero.tsx`

**CHANGE 1 — H1 Title (lines 32-38)**

```diff
- <h1 className={styles.heroTitle}>
-   Boost your
-   <br />
-   sales with
-   <br />
-   <span className={styles.heroTitleAccent}>Smart Commerce</span>
- </h1>
+ <h1 className={styles.heroTitle}>
+   Online Store Builder
+   <br />
+   <span className={styles.heroTitleAccent}>with WhatsApp Selling</span>
+ </h1>
```

**CHANGE 2 — Subtitle (lines 41-45)**

```diff
- <p className={styles.heroSubtitle}>
-   Packed with AI-powered automation, real-time analytics, WhatsApp
-   commerce &amp; more — everything you need to run your business, 10x
-   faster.
- </p>
+ <p className={styles.heroSubtitle}>
+   Create your free online store in 5 minutes. AI chatbot, WhatsApp order
+   automation, payment collection &amp; invoice delivery — everything you
+   need to sell online. No coding required.
+ </p>
```

**CHANGE 3 — Trust Badge (uncomment and update, lines 24-29)**

```diff
- {/* Trust badge
- <div className={styles.trustBadge}>
-   <span className={styles.trustStar}>★</span>
-   <span>
-     <span className={styles.trustScore}>4.7</span> on TrustPilot
-   </span>
- </div> */}
+ <div className={styles.trustBadge}>
+   <span className={styles.trustStar}>★</span>
+   <span>
+     <span className={styles.trustScore}>4.8</span> — #1 WhatsApp E-commerce Platform
+   </span>
+ </div>
```

**CHANGE 4 — CTA Buttons (lines 48-57)**

```diff
  <div className={styles.heroCtas}>
-   <Link href="/signup" className={styles.btnPrimary}>
-     Try Now
-   </Link>
+   <Link href="/signup" className={styles.btnPrimary}>
+     Create Free Store
+   </Link>
    <button
      className={styles.btnSecondary}
      onClick={() => setDemoOpen(true)}
    >
-     See Demo
+     See How It Works
    </button>
  </div>
```

**CHANGE 5 — Image alt text (line 68)**

```diff
- alt="Flowauxi commerce platform in action"
+ alt="Flowauxi online store builder with WhatsApp selling — create your free store"
```

### Rationale
- H1 "Online Store Builder with WhatsApp Selling" targets the #1 keyword ("online store builder" — 12K/mo) AND the #4 keyword ("whatsapp store builder" — 6.5K/mo)
- Subtitle includes LSI keywords: "free online store", "AI chatbot", "WhatsApp order automation", "payment collection", "invoice delivery", "no coding required"
- CTA "Create Free Store" matches transactional intent for "create online store free" (18K/mo)
- Trust badge reinforces "WhatsApp E-commerce Platform" positioning

---

## TASK 2: Create `/online-store-builder` Landing Page

### Target Keyword
"online store builder" — 12,000 monthly searches (IN), KD 45

### Create: `frontend/app/online-store-builder/page.tsx`

This is a NEW file. Full page structure:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { generateHowToSchema } from "@/lib/seo/schema-extensions";
import { generateFaqSchemaForPAA } from "@/lib/seo/ctr-optimization";

export const metadata: Metadata = {
  title: "Online Store Builder — Create Your Store in Minutes | Flowauxi",
  description:
    "Build your online store in 10 minutes with Flowauxi. Free website + WhatsApp integration, AI chatbot, order automation, and payment collection. No coding required. Start free today.",
  keywords: [
    "online store builder",
    "create online store",
    "best online store builder",
    "free website builder",
    "ecommerce website builder",
    "start online store",
    "online store builder india",
    "free online store builder",
    "best website builder for small business",
    "whatsapp store builder",
  ],
  openGraph: {
    title: "Online Store Builder — Create Your Store in Minutes | Flowauxi",
    description: "Build your online store in 10 minutes. Free website + WhatsApp + AI chatbot. No coding required.",
    url: "https://www.flowauxi.com/online-store-builder",
    type: "website",
    images: [{ url: "/og-online-store-builder.png", width: 1200, height: 630 }],
  },
  alternates: { canonical: "https://www.flowauxi.com/online-store-builder" },
};

const FAQ_QUESTIONS = [
  {
    question: "What is the best online store builder?",
    answer: "Flowauxi is the best online store builder for small businesses and WhatsApp sellers. Unlike Shopify or Wix, Flowauxi includes a free website, built-in WhatsApp selling, AI chatbot, order automation, and payment collection — all in one platform. Plans start free with no credit card required.",
  },
  {
    question: "Can I create an online store for free?",
    answer: "Yes! Flowauxi offers a free online store with no credit card required. You get a professional website, WhatsApp integration, AI chatbot, and order management. No hidden fees, no trial limits on the website. Premium features like unlimited products and custom domains are available in paid plans starting at ₹1,999/month.",
  },
  {
    question: "How do I create an online store?",
    answer: "Creating an online store with Flowauxi takes 3 steps: 1) Sign up for free, 2) Add your products (or import via CSV), 3) Your store is live immediately. You can connect WhatsApp, set up payments via Razorpay or UPI, and the AI chatbot starts handling customer queries automatically.",
  },
  {
    question: "What makes Flowauxi different from Shopify?",
    answer: "Flowauxi includes WhatsApp selling, AI chatbot, invoice automation, and order tracking — features that require paid apps on Shopify. Flowauxi gives you a free website forever, while Shopify charges ₹1,499/month minimum. Flowauxi is built for Indian businesses with UPI, Razorpay, and GST invoices built in.",
  },
  {
    question: "How much does it cost to start an online store?",
    answer: "You can start an online store with Flowauxi for free. The free plan includes a website, WhatsApp integration, AI chatbot, and order management. Paid plans start at ₹1,999/month and include custom domains, unlimited products, and advanced analytics. No transaction fees on orders.",
  },
  {
    question: "Can I sell on WhatsApp with my online store?",
    answer: "Yes! Flowauxi is the only online store builder with native WhatsApp integration. Your products appear in a WhatsApp catalog, customers can order directly through WhatsApp chat, and the AI chatbot handles queries 24/7. Orders sync automatically between your website and WhatsApp.",
  },
];

const COMPARISON_FEATURES = [
  { feature: "Free Plan", flowauxi: "✓ Forever Free", shopify: "✗ 14-day trial", wix: "✗ Shows ads", dukaan: "✓ Limited" },
  { feature: "WhatsApp Selling", flowauxi: "✓ Built-in", shopify: "✗ Paid app", wix: "✗ Not available", dukaan: "✗ Not available" },
  { feature: "AI Chatbot", flowauxi: "✓ Included Free", shopify: "✗ Paid app", wix: "✗ Not available", dukaan: "✗ Paid addon" },
  { feature: "Order Automation", flowauxi: "✓ Built-in", shopify: "✗ Paid app", wix: "✗ Limited", dukaan: "✓ Basic" },
  { feature: "Invoice (GST)", flowauxi: "✓ Built-in", shopify: "✗ Paid app", wix: "✗ Manual", dukaan: "✗ Paid addon" },
  { feature: "UPI Payments", flowauxi: "✓ Razorpay + UPI", shopify: "✓ Third-party", wix: "✓ Limited", dukaan: "✓ Razorpay" },
  { feature: "Starting Price", flowauxi: "Free", shopify: "₹1,499/mo", wix: "₹649/mo", dukaan: "₹999/mo" },
];

export default function OnlineStoreBuilderPage() {
  const howToSchema = generateHowToSchema({
    name: "How to Create an Online Store",
    description: "Step-by-step guide to creating your free online store with WhatsApp selling using Flowauxi.",
    totalTime: "PT10M",
    estimatedCost: { currency: "INR", value: "0" },
    steps: [
      { position: 1, name: "Sign Up for Free", text: "Create your Flowauxi account in 30 seconds. No credit card required.", url: "https://www.flowauxi.com/signup" },
      { position: 2, name: "Add Your Products", text: "Upload your product catalog manually or import via CSV. Add images, prices, and descriptions.", url: "https://www.flowauxi.com/features/whatsapp-store" },
      { position: 3, name: "Connect WhatsApp & Payments", text: "Link your WhatsApp Business account and set up Razorpay or UPI for payments.", url: "https://www.flowauxi.com/features/order-automation" },
    ],
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateHowToSchema({...})) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(generateFaqSchemaForPAA(FAQ_QUESTIONS)) }} />
      {/* BreadcrumbList schema */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [ { "@type": "ListItem", position: 1, name: "Home", item: "https://www.flowauxi.com" }, { "@type": "ListItem", position: 2, name: "Online Store Builder", item: "https://www.flowauxi.com/online-store-builder" } ] }) }} />

      <main className="max-w-6xl mx-auto px-4 py-16">
        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-8">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900">Online Store Builder</span>
        </nav>

        {/* H1 — Primary keyword in heading */}
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
          Online Store Builder — Create Your Store in Minutes
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-3xl">
          Build your online store with Flowauxi. Free website, WhatsApp selling, AI chatbot, 
          order automation, and payment collection. Join 500+ businesses. No coding required.
        </p>
        <div className="flex flex-wrap gap-4 mb-16">
          <Link href="/signup" className="px-8 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700">
            Create Free Online Store
          </Link>
          <Link href="/features/whatsapp-store" className="px-8 py-4 border-2 border-green-600 text-green-600 rounded-lg font-semibold hover:bg-green-50">
            See All Features
          </Link>
        </div>

        {/* H2 — Why businesses choose Flowauxi */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Why 500+ Businesses Choose Flowauxi
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature cards with keyword-rich descriptions */}
            <div className="border rounded-lg p-6">
              <h3 className="text-xl font-semibold mb-2">WhatsApp Integration Built In</h3>
              <p className="text-gray-600">The only online store builder with native WhatsApp selling. Products appear in your WhatsApp catalog, orders come through chat, and the AI chatbot handles queries 24/7.</p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="text-xl font-semibold mb-2">AI Chatbot for Customer Support</h3>
              <p className="text-gray-600">An intelligent chatbot trained on your product catalog answers customer questions, processes orders, and sends invoices — all through WhatsApp automatically.</p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="text-xl font-semibold mb-2">Free Plan — No Credit Card Required</h3>
              <p className="text-gray-600">Get a professional online store for free. No ads, no trial limits on the website. Upgrade only when you need custom domains or unlimited products.</p>
            </div>
          </div>
        </section>

        {/* H2 — Feature Comparison Table */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Online Store Builder Comparison — Flowauxi vs the Competition
          </h2>
          {/* Comparison table... (7 rows from COMPARISON_FEATURES) */}
        </section>

        {/* H2 — How to Create Your Online Store (HowTo) */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            How to Create Your Online Store in 3 Steps
          </h2>
          {/* 3-step process with schema */}
        </section>

        {/* H2 — Features That Power Your Online Store */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Features That Power Your Online Store
          </h2>
          {/* 6 feature cards with internal links */}
        </section>

        {/* H2 — FAQ */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-6">
            Frequently Asked Questions About Online Store Builders
          </h2>
          {/* 6 FAQ accordion items */}
        </section>

        {/* H2 — CTA */}
        <section className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Start Building Your Online Store Now
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Free website. WhatsApp selling. AI chatbot. No coding required.
          </p>
          <Link href="/signup" className="px-8 py-4 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 text-lg">
            Create Your Free Online Store
          </Link>
        </section>
      </main>
    </>
  );
}
```

**INTERNAL LINKS (must be included):**
- `/features/whatsapp-store` — "WhatsApp Store Builder"
- `/free-website-builder` — "Free Website Builder"
- `/ecommerce-website-builder` — "Ecommerce Website Builder"
- `/create-online-store-free` — "Create Online Store Free"
- `/compare/shopify` — "Flowauxi vs Shopify"
- `/compare/dukaan` — "Flowauxi vs Dukaan"
- `/features/ai-chatbot` — "AI Chatbot for E-commerce"
- `/features/order-automation` — "Order Automation"
- `/blog/how-to-sell-on-whatsapp` — "How to Sell on WhatsApp"
- `/blog/what-is-whatsapp-ecommerce` — "What is WhatsApp E-commerce?"

---

## TASK 3: Create `/free-website-builder` Landing Page

### Target Keyword
"free website builder" — 22,000 monthly searches (IN), KD 50

### Create: `frontend/app/free-website-builder/page.tsx`

Same architecture as Task 2 but with these key differences:

```typescript
export const metadata: Metadata = {
  title: "Free Website Builder — No Cost, No Code, No Catch | Flowauxi",
  description:
    "Create a free website with Flowauxi. Professional design, WhatsApp integration, AI chatbot included. No credit card required. Join 500+ businesses selling online for free.",
  keywords: [
    "free website builder",
    "free online store",
    "create free website",
    "free ecommerce website",
    "free website builder india",
    "no code website builder",
    "best free website builder",
    "free online store builder india",
    "website builder free no coding",
    "free store builder",
  ],
  alternates: { canonical: "https://www.flowauxi.com/free-website-builder" },
};
```

**H1:** "Free Website Builder — Create Your Website at Zero Cost"

**Key Sections:**
- H2: "Really Free? Yes — Here's How" (address skepticism head-on)
- H2: "What You Get With Your Free Website" (feature list)
- H2: "Free Website Builder Comparison (We Actually Mean Free)" (vs Shopify ₹1,499/mo, Dukaan ₹999/mo, Wix shows ads)
- H2: "How to Build Your Free Website in 5 Minutes" (HowTo schema)
- H2: "Free Website FAQs — No Hidden Costs" (6 PAA-targeted FAQs)
- H2: "Start Building Your Free Website Now" (CTA)

**Critical Differentiator:** Hammer the "actually free" message. Shopify costs ₹1,499/month minimum. Dukaan costs ₹999/month. Wix shows ads on free. Flowauxi = free website. Period.

---

## TASK 4: Create `/ecommerce-website-builder` Landing Page

### Target Keyword
"ecommerce website builder" — 8,500 monthly searches (IN), KD 48

### Create: `frontend/app/ecommerce-website-builder/page.tsx`

```typescript
export const metadata: Metadata = {
  title: "Ecommerce Website Builder with WhatsApp Selling | Flowauxi",
  description:
    "Build a complete ecommerce website with Flowauxi. WhatsApp store, AI chatbot, order automation, payment integration, and invoice generation. Plans start free. Try now.",
  keywords: [
    "ecommerce website builder",
    "best ecommerce platform",
    "ecommerce website builder india",
    "online store builder",
    "create ecommerce website",
    "ecommerce platform",
    "best ecommerce website builder",
    "start ecommerce website",
    "ecommerce builder free",
    "whatsapp ecommerce platform",
  ],
  alternates: { canonical: "https://www.flowauxi.com/ecommerce-website-builder" },
};
```

**H1:** "Ecommerce Website Builder — Sell Online + WhatsApp"

**Key Sections:**
- H2: "The Only Ecommerce Builder with Native WhatsApp Selling"
- H2: "Full Ecommerce Features Built In" (6 features grid)
- H2: "Ecommerce Website Builder Feature Comparison" (table vs Shopify, Dukaan, Wix)
- H2: "Built for Indian Businesses — UPI, GST, WhatsApp" (India-specific trust signals)
- H2: "How to Launch Your Ecommerce Website Today" (HowTo schema)
- H2: "Ecommerce FAQs" (6 PAA-targeted FAQs)
- H2: "Start Selling Online — Create Your Free Store" (CTA)

---

## TASK 5: Create `/create-online-store-free` Landing Page

### Target Keyword
"create online store free" — 18,000 monthly searches (IN), KD 55

### Create: `frontend/app/create-online-store-free/page.tsx`

```typescript
export const metadata: Metadata = {
  title: "Create Online Store Free — No Credit Card, No Trial Limits | Flowauxi",
  description:
    "Create your online store free with Flowauxi. Professional design, WhatsApp integration, AI chatbot, order automation. Get a free website forever. Start in 5 minutes.",
  keywords: [
    "create online store free",
    "free online store",
    "create free website",
    "start online store free",
    "free online store india",
    "free ecommerce website",
    "online store builder free",
    "create free online store",
    "free store builder",
    "how to create online store for free",
  ],
  alternates: { canonical: "https://www.flowauxi.com/create-online-store-free" },
};
```

**H1:** "Create Your Online Store Free — Start Selling Today"

**Key Sections:**
- H2: "3 Steps to Your Free Online Store" (HowTo schema — most important for this page)
- H2: "What's Included in Your Free Online Store" (feature list with icons)
- H2: "Free vs Paid — What You Actually Get" (transparent pricing table)
- H2: "Online Store Success Stories" (testimonials/quotes)
- H2: "Free Online Store FAQs" (6 PAA-targeted FAQs)
- H2: "Create Your Free Store Now — No Credit Card Needed" (CTA)

---

## TASK 6: Create `lib/seo/schema-extensions.ts`

### New file with HowTo, LocalBusiness, Review, Offer, Pricing schemas

This file provides schema generators used by all landing pages and city/industry pages.

```typescript
/**
 * Schema Extensions — Additional structured data schemas
 * for Feature pages, City pages, Comparison pages, and Landing pages.
 * 
 * These supplement the existing schemas in domain-seo.ts and structured-data.ts.
 */

export interface HowToStep {
  name: string;
  text: string;
  url?: string;
  image?: string;
  position: number;
}

export function generateHowToSchema(howTo: {
  name: string;
  description: string;
  totalTime?: string;
  estimatedCost?: { currency: string; value: string };
  supply?: string[];
  tool?: string[];
  steps: HowToStep[];
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: howTo.name,
    description: howTo.description,
    totalTime: howTo.totalTime,
    estimatedCost: howTo.estimatedCost ? {
      "@type": "MonetaryAmount",
      currency: howTo.estimatedCost.currency,
      value: howTo.estimatedCost.value,
    } : undefined,
    supply: howTo.supply?.map(s => ({ "@type": "HowToSupply", name: s })),
    tool: howTo.tool?.map(t => ({ "@type": "HowToTool", name: t })),
    step: howTo.steps.map(step => ({
      "@type": "HowToStep",
      position: step.position,
      name: step.name,
      text: step.text,
      url: step.url,
      image: step.image ? { "@type": "ImageObject", url: step.image } : undefined,
    })),
  };
}

export function generateLocalBusinessSchema(city: {
  name: string;
  state: string;
  country?: string;
  merchantCount?: number;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `https://www.flowauxi.com/whatsapp-store/${city.name.toLowerCase().replace(/\s+/g, '-')}#localbusiness`,
    name: `Flowauxi WhatsApp Store — ${city.name}`,
    description: `Create your free WhatsApp online store in ${city.name}, ${city.state}. ${city.merchantCount ? `Trusted by ${city.merchantCount}+ businesses` : 'Start selling on WhatsApp today'}.`,
    url: `https://www.flowauxi.com/whatsapp-store/${city.name.toLowerCase().replace(/\s+/g, '-')}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: city.name,
      addressRegion: city.state,
      addressCountry: city.country || "IN",
    },
    areaServed: {
      "@type": city.country === "IN" ? "State" : "Country",
      name: city.state,
    },
    parentOrganization: { "@id": "https://www.flowauxi.com/#organization" },
  };
}

export function generateReviewSchema(review: {
  author: string;
  ratingValue: number;
  reviewBody: string;
  datePublished: string;
  itemName: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Review",
    author: { "@type": "Person", name: review.author },
    datePublished: review.datePublished,
    reviewBody: review.reviewBody,
    reviewRating: {
      "@type": "Rating",
      ratingValue: review.ratingValue,
      bestRating: 5,
    },
    itemReviewed: {
      "@type": "SoftwareApplication",
      name: review.itemName,
    },
  };
}

export function generatePricingSchema(plans: Array<{
  name: string;
  price: number;
  currency: string;
  description: string;
  features: string[];
  priceValidUntil?: string;
}>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Flowauxi",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any",
    offers: plans.map(plan => ({
      "@type": "Offer",
      name: plan.name,
      price: plan.price.toFixed(2),
      priceCurrency: plan.currency,
      description: plan.description,
      availability: "https://schema.org/InStock",
      priceValidUntil: plan.priceValidUntil,
    })),
  };
}
```

---

## TASK 7: Update `lib/seo/domain-seo.ts` — Shop Domain Keywords Enhancement

### File: `frontend/lib/seo/domain-seo.ts`

Add the "online store builder" keyword cluster to the shop domain config (lines 157-176):

**Current keywords array (shop domain):**
```typescript
keywords: [
  "WhatsApp store builder",
  "WhatsApp order automation",
  "WhatsApp chatbot for online store",
  "WhatsApp e-commerce platform",
  "automated order booking WhatsApp",
  "WhatsApp automation for e-commerce",
  "AI chatbot for e-commerce",
  "online store with WhatsApp integration",
  "WhatsApp CRM for e-commerce",
  "conversational commerce platform",
  "WhatsApp product catalog",
  "automate WhatsApp sales",
  "best WhatsApp store builder India",
  "D2C WhatsApp automation",
  "WhatsApp business store",
  "ecommerce WhatsApp chatbot",
  "sell online via WhatsApp",
  "WhatsApp order management",
]
```

**NEW keywords array (enhanced with "online store builder" cluster):**
```typescript
keywords: [
  // PRIMARY: "online store builder" cluster (54K+ total volume)
  "online store builder",
  "free online store builder",
  "best online store builder India",
  "create online store",
  "start online store",
  "online store builder free",
  // PRIMARY: "whatsapp store builder" cluster (12K+ total volume)
  "WhatsApp store builder",
  "WhatsApp order automation",
  "WhatsApp chatbot for online store",
  "WhatsApp e-commerce platform",
  "automated order booking WhatsApp",
  "WhatsApp automation for e-commerce",
  // SECONDARY: LSI keywords
  "AI chatbot for e-commerce",
  "online store with WhatsApp integration",
  "WhatsApp CRM for e-commerce",
  "conversational commerce platform",
  "WhatsApp product catalog",
  "automate WhatsApp sales",
  "best WhatsApp store builder India",
  "D2C WhatsApp automation",
  "WhatsApp business store",
  "ecommerce WhatsApp chatbot",
  "sell online via WhatsApp",
  "WhatsApp order management",
  // LONG-TAIL: High-converting specific queries
  "free website builder India",
  "create online store free",
  "ecommerce website builder",
  "best website builder for small business India",
  "online store builder with WhatsApp",
],
```

---

## TASK 8: Update `app/metadata.ts` — Add Landing Page Metadata

### File: `frontend/app/metadata.ts`

Add 4 new metadata exports after the existing `blogMetadata`:

```typescript
// Online Store Builder landing page metadata
export const onlineStoreBuilderMetadata: Metadata = {
  title: "Online Store Builder — Create Your Store in Minutes | Flowauxi",
  description:
    "Build your online store in 10 minutes with Flowauxi. Free website + WhatsApp integration, AI chatbot, order automation, and payment collection. No coding required. Start free today.",
  keywords: [
    "online store builder",
    "create online store",
    "best online store builder",
    "free website builder",
    "ecommerce website builder",
    "start online store",
    "online store builder india",
    "free online store builder",
    "best website builder for small business",
    "whatsapp store builder",
  ],
  openGraph: {
    title: "Online Store Builder — Create Your Store in Minutes | Flowauxi",
    description: "Build your online store in 10 minutes. Free website + WhatsApp + AI chatbot. No coding required.",
    url: "https://www.flowauxi.com/online-store-builder",
    type: "website",
    images: [{ url: "https://www.flowauxi.com/og-online-store-builder.png", width: 1200, height: 630 }],
  },
  alternates: { canonical: "https://www.flowauxi.com/online-store-builder" },
};

// Free Website Builder landing page metadata
export const freeWebsiteBuilderMetadata: Metadata = {
  title: "Free Website Builder — No Cost, No Code, No Catch | Flowauxi",
  description:
    "Create a free website with Flowauxi. Professional design, WhatsApp integration, AI chatbot included. No credit card required. Join 500+ businesses selling online for free.",
  keywords: [
    "free website builder",
    "free online store",
    "create free website",
    "free ecommerce website",
    "free website builder india",
    "no code website builder",
    "best free website builder",
    "free online store builder india",
    "website builder free no coding",
    "free store builder",
  ],
  openGraph: {
    title: "Free Website Builder — No Cost, No Code, No Catch | Flowauxi",
    description: "Create a free website with Flowauxi. No credit card required. Professional design + WhatsApp selling.",
    url: "https://www.flowauxi.com/free-website-builder",
    type: "website",
    images: [{ url: "https://www.flowauxi.com/og-free-website-builder.png", width: 1200, height: 630 }],
  },
  alternates: { canonical: "https://www.flowauxi.com/free-website-builder" },
};

// Ecommerce Website Builder landing page metadata
export const ecommerceWebsiteBuilderMetadata: Metadata = {
  title: "Ecommerce Website Builder with WhatsApp Selling | Flowauxi",
  description:
    "Build a complete ecommerce website with Flowauxi. WhatsApp store, AI chatbot, order automation, payment integration, and invoice generation. Plans start free. Try now.",
  keywords: [
    "ecommerce website builder",
    "best ecommerce platform",
    "ecommerce website builder india",
    "online store builder",
    "create ecommerce website",
    "ecommerce platform",
    "best ecommerce website builder",
    "start ecommerce website",
    "ecommerce builder free",
    "whatsapp ecommerce platform",
  ],
  openGraph: {
    title: "Ecommerce Website Builder with WhatsApp Selling | Flowauxi",
    description: "Build a complete ecommerce website. WhatsApp selling, AI chatbot, payments built in. Start free.",
    url: "https://www.flowauxi.com/ecommerce-website-builder",
    type: "website",
    images: [{ url: "https://www.flowauxi.com/og-ecommerce-website-builder.png", width: 1200, height: 630 }],
  },
  alternates: { canonical: "https://www.flowauxi.com/ecommerce-website-builder" },
};

// Create Online Store Free landing page metadata
export const createOnlineStoreFreeMetadata: Metadata = {
  title: "Create Online Store Free — No Credit Card, No Trial Limits | Flowauxi",
  description:
    "Create your online store free with Flowauxi. Professional design, WhatsApp integration, AI chatbot, order automation. Get a free website forever. Start in 5 minutes.",
  keywords: [
    "create online store free",
    "free online store",
    "create free website",
    "start online store free",
    "free online store india",
    "free ecommerce website",
    "online store builder free",
    "create free online store",
    "free store builder",
    "how to create online store for free",
  ],
  openGraph: {
    title: "Create Online Store Free — No Credit Card, No Trial Limits | Flowauxi",
    description: "Create your online store free. WhatsApp + AI chatbot + payments built in. Start in 5 minutes.",
    url: "https://www.flowauxi.com/create-online-store-free",
    type: "website",
    images: [{ url: "https://www.flowauxi.com/og-create-online-store-free.png", width: 1200, height: 630 }],
  },
  alternates: { canonical: "https://www.flowauxi.com/create-online-store-free" },
};
```

---

## TASK 9: Update `app/sitemap.ts` — Add New Landing Pages + Fix Missing Pages

### File: `frontend/app/sitemap.ts`

**Changes needed in the main domain sitemap section (around line 286+):**

Add these entries after the existing `/features/entry` and before `/compare/entry`:

```typescript
// NEW: Priority landing pages (P0 keywords — 54K+ monthly search volume)
{
  url: `${baseUrl}/online-store-builder`,
  lastModified: now,
  changeFrequency: "weekly",
  priority: 1.0,  // HIGHEST — "online store builder" 12K/mo
},
{
  url: `${baseUrl}/free-website-builder`,
  lastModified: now,
  changeFrequency: "weekly",
  priority: 1.0,  // HIGHEST — "free website builder" 22K/mo
},
{
  url: `${baseUrl}/ecommerce-website-builder`,
  lastModified: now,
  changeFrequency: "weekly",
  priority: 1.0,  // HIGHEST — "ecommerce website builder" 8.5K/mo
},
{
  url: `${baseUrl}/create-online-store-free`,
  lastModified: now,
  changeFrequency: "weekly",
  priority: 1.0,  // HIGHEST — "create online store free" 18K/mo
},
```

Also add the programmatic pages that are currently missing (after the whatsapp-store/city entries, around line 475):

```typescript
// Programmatic industry pages (currently MISSING from sitemap)
// NOTE: These are dynamically generated, but we list the known high-quality ones
{
  url: `${baseUrl}/ecommerce`,
  lastModified: now,
  changeFrequency: "weekly",
  priority: 0.85,
},
```

---

## TASK 10: Create `lib/seo/indexnow.ts` — IndexNow Protocol

### New file: `frontend/lib/seo/indexnow.ts`

```typescript
/**
 * IndexNow Protocol — Instant Search Engine Indexing
 * ==================================================
 * Submits URLs to Bing, Yandex, Seznam, and Naver simultaneously.
 * 
 * @see https://www.indexnow.org/
 * 
 * Usage:
 *   import { notifySearchEngines, batchNotifySearchEngines } from "@/lib/seo/indexnow";
 *   
 *   // Single URL
 *   await notifySearchEngines("https://www.flowauxi.com/online-store-builder");
 *   
 *   // Batch URLs
 *   await batchNotifySearchEngines([
 *     "https://www.flowauxi.com/free-website-builder",
 *     "https://www.flowauxi.com/ecommerce-website-builder",
 *   ]);
 */

const INDEXNOW_KEY = process.env.INDEXNOW_API_KEY || "flowauxi2024seo";
const INDEXNOW_HOST = "www.flowauxi.com";

const SEARCH_ENGINES = [
  "https://api.indexnow.org/indexnow",
  "https://searchengines.yandex.ru/indexnow",
  "https://search.seznam.cz/indexnow",
  "https://api.naver.com/indexnow",
];

interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

export async function submitToIndexNow(urls: string[]): Promise<boolean[]> {
  const payload: IndexNowPayload = {
    host: INDEXNOW_HOST,
    key: INDEXNOW_KEY,
    keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
    urlList: urls.slice(0, 10000),
  };

  const results = await Promise.allSettled(
    SEARCH_ENGINES.map(async (endpoint) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return response.ok;
    })
  );

  return results.map((r) => r.status === "fulfilled" && r.value === true);
}

export async function notifySearchEngines(url: string): Promise<void> {
  await submitToIndexNow([url]);
}

export async function batchNotifySearchEngines(urls: string[]): Promise<void> {
  for (let i = 0; i < urls.length; i += 100) {
    const batch = urls.slice(i, i + 100);
    await submitToIndexNow(batch);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
```

Also need to create the key verification file at `frontend/public/flowauxi2024seo.txt` with content:
```
flowauxi2024seo
```

---

## TASK 11: Update `lib/seo/intent-matrix.ts` — Add Landing Page Keywords

### File: `frontend/lib/seo/intent-matrix.ts`

Add these entries to the `INTENT_MATRIX` array at the beginning (after the existing entries):

```typescript
// New P0 landing page entries for the 4 target keywords
{
  keyword: "online store builder",
  volume: 12000,
  difficulty: 45,
  intent: "commercial",
  contentFormat: "landing_page",
  pageTemplate: "/online-store-builder",
  wordCount: [4000, 6000],
  mediaRequirements: [
    { type: "screenshot", minCount: 6, purpose: "Product demo" },
    { type: "infographic", minCount: 1, purpose: "Comparison visualization" },
    { type: "table", minCount: 1, purpose: "Feature comparison vs competitors" },
  ],
  schema: ["SoftwareApplication", "FAQPage", "HowTo", "BreadcrumbList"],
  ctaPlacements: ["top-hero", "after-intro", "middle", "after-comparison", "bottom"],
  internalLinkDensity: 15,
  priority: "immediate",
  competitorGap: true,
},
{
  keyword: "free website builder",
  volume: 22000,
  difficulty: 50,
  intent: "transactional",
  contentFormat: "landing_page",
  pageTemplate: "/free-website-builder",
  wordCount: [4000, 6000],
  mediaRequirements: [
    { type: "screenshot", minCount: 6, purpose: "Product demo" },
    { type: "infographic", minCount: 1, purpose: "Pricing comparison" },
    { type: "table", minCount: 1, purpose: "Free plan comparison vs competitors" },
  ],
  schema: ["SoftwareApplication", "FAQPage", "HowTo", "BreadcrumbList"],
  ctaPlacements: ["top-hero", "after-intro", "middle", "after-pricing", "bottom"],
  internalLinkDensity: 12,
  priority: "immediate",
  competitorGap: true,
},
{
  keyword: "ecommerce website builder",
  volume: 8500,
  difficulty: 48,
  intent: "commercial",
  contentFormat: "landing_page",
  pageTemplate: "/ecommerce-website-builder",
  wordCount: [4000, 6000],
  mediaRequirements: [
    { type: "screenshot", minCount: 8, purpose: "Feature demo" },
    { type: "infographic", minCount: 1, purpose: "Ecommerce features" },
    { type: "table", minCount: 2, purpose: "Feature comparison" },
  ],
  schema: ["SoftwareApplication", "FAQPage", "HowTo", "BreadcrumbList"],
  ctaPlacements: ["top-hero", "after-intro", "middle", "after-comparison", "bottom"],
  internalLinkDensity: 15,
  priority: "immediate",
  competitorGap: true,
},
{
  keyword: "create online store free",
  volume: 18000,
  difficulty: 55,
  intent: "transactional",
  contentFormat: "landing_page",
  pageTemplate: "/create-online-store-free",
  wordCount: [3000, 5000],
  mediaRequirements: [
    { type: "screenshot", minCount: 4, purpose: "Step-by-step demo" },
    { type: "video", minCount: 1, purpose: "5-minute setup walkthrough" },
    { type: "table", minCount: 1, purpose: "Free vs paid comparison" },
  ],
  schema: ["SoftwareApplication", "FAQPage", "HowTo", "BreadcrumbList"],
  ctaPlacements: ["top-hero", "after-intro", "middle", "after-pricing", "bottom"],
  internalLinkDensity: 12,
  priority: "immediate",
  competitorGap: true,
},
```

---

## TASK 12: Add `lib/seo/schema-extensions.ts` Export to SEO Index

### File: `frontend/lib/seo/index.ts`

Add these exports:

```typescript
// Schema Extensions (NEW)
export {
  type HowToStep,
  generateHowToSchema,
  generateLocalBusinessSchema,
  generateReviewSchema,
  generatePricingSchema,
} from "./schema-extensions";

// IndexNow Protocol (NEW)
export {
  submitToIndexNow,
  notifySearchEngines,
  batchNotifySearchEngines,
} from "./indexnow";
```

---

## DEPENDENCY ORDER

Tasks must be completed in this order due to dependencies:

1. **TASK 6** — Create `schema-extensions.ts` first (other files import from it)
2. **TASK 10** — Create `indexnow.ts` second
3. **TASK 12** — Update `seo/index.ts` exports third
4. **TASK 1** — Fix ShopHero H1 (independent, can be done anytime)
5. **TASK 8** — Update `domain-seo.ts` keywords (independent)
6. **TASK 9** — Update `metadata.ts` (independent)
7. **TASK 11** — Update `sitemap.ts` (independent)
8. **TASK 2-5** — Create 4 landing pages (depend on TASK 6 for schema imports)
9. **TASK 7** — Update `intent-matrix.ts` (independent)

---

## FILES SUMMARY

| Task | Action | File | Priority |
|------|--------|------|----------|
| 1 | MODIFY | `frontend/app/(shop)/components/ShopHero.tsx` | P0 |
| 2 | CREATE | `frontend/app/online-store-builder/page.tsx` | P0 |
| 3 | CREATE | `frontend/app/free-website-builder/page.tsx` | P0 |
| 4 | CREATE | `frontend/app/ecommerce-website-builder/page.tsx` | P0 |
| 5 | CREATE | `frontend/app/create-online-store-free/page.tsx` | P0 |
| 6 | CREATE | `frontend/lib/seo/schema-extensions.ts` | P0 |
| 7 | MODIFY | `frontend/lib/seo/domain-seo.ts` | P0 |
| 8 | MODIFY | `frontend/app/metadata.ts` | P0 |
| 9 | MODIFY | `frontend/app/sitemap.ts` | P0 |
| 10 | CREATE | `frontend/lib/seo/indexnow.ts` | P0 |
| 11 | MODIFY | `frontend/lib/seo/intent-matrix.ts` | P1 |
| 12 | MODIFY | `frontend/lib/seo/index.ts` | P0 |
| — | CREATE | `frontend/public/flowauxi2024seo.txt` | P0 |

**Total: 4 new pages + 2 new SEO modules + 6 file modifications + 1 static file = 13 changes**

---

## EXPECTED IMPACT

| Change | Target Keyword | Monthly Volume (IN) | Current Ranking | Expected Position (6 months) |
|--------|---------------|---------------------|----------------|------------------------------|
| Shop Hero H1 fix | "online store builder" | 12,000 | Not in top 100 | 5-10 |
| `/online-store-builder` | "online store builder" | 12,000 | N/A (new page) | 8-15 |
| `/free-website-builder` | "free website builder" | 22,000 | N/A | 10-20 |
| `/ecommerce-website-builder` | "ecommerce website builder" | 8,500 | N/A | 10-15 |
| `/create-online-store-free` | "create online store free" | 18,000 | N/A | 8-15 |
| Schema gaps fixed | Rich snippets | — | — | CTR +15-20% |
| Sitemap updates | Indexation | — | Partial | Full coverage |
| IndexNow | Indexation speed | — | Days-weeks | Hours |

**Combined target: 54,000+ monthly searches → Goal of 8,000-15,000 organic sessions/month within 6 months from these changes alone.**