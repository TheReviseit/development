/**
 * CTR Optimization Layer - FAANG Level SEO
 * =========================================
 *
 * This module provides title tags, meta descriptions, and rich snippet
 * optimization to maximize click-through rates in SERPs.
 *
 * FAANG Principle: Moving from 5% CTR to 8% CTR = 60% more clicks
 * with zero content creation. Title tag testing + rich snippets = free traffic.
 */

import type { SearchIntent } from "./entity-graph";

// =============================================================================
// TYPES
// =============================================================================

export interface TitleTagVariant {
  template: string;
  emotionalTrigger: string;
  characterLimit: [min: number, max: number];
  testPriority: "high" | "medium" | "low";
}

export interface MetaDescriptionVariant {
  template: string;
  cta: string;
  characterLimit: [min: number, max: number];
  testPriority: "high" | "medium" | "low";
}

export interface RichSnippetConfig {
  schemaType: string;
  required: boolean;
  priority: "high" | "medium" | "low";
  conditions: string[];
}

export interface CTAConfig {
  primary: string;
  secondary: string;
  placement: ("top-hero" | "above-fold" | "after-intro" | "middle" | "bottom" | "sidebar" | "after-benefits")[];
}

// =============================================================================
// TITLE TAG FRAMEWORKS
// =============================================================================

export const TITLE_TAG_FRAMEWORKS: Record<string, TitleTagVariant[]> = {
  feature_page: [
    {
      template: "{primary_kw} - {emotional_trigger} | Flowauxi",
      emotionalTrigger: "Make Money While You Sleep",
      characterLimit: [50, 60],
      testPriority: "high",
    },
    {
      template: "{primary_kw} - {number}+ Businesses Trust Us | Flowauxi",
      emotionalTrigger: "social proof",
      characterLimit: [50, 60],
      testPriority: "high",
    },
    {
      template: "{primary_kw}? {brand} Makes It Easy. {benefit}. | Flowauxi",
      emotionalTrigger: "ease",
      characterLimit: [55, 60],
      testPriority: "medium",
    },
    {
      template: "{primary_kw} - {benefit_1} + {benefit_2} | Flowauxi",
      emotionalTrigger: "feature stack",
      characterLimit: [50, 60],
      testPriority: "medium",
    },
    {
      template: "{primary_kw} | Free {feature} Included | Flowauxi",
      emotionalTrigger: "free",
      characterLimit: [50, 60],
      testPriority: "high",
    },
  ],

  comparison_page: [
    {
      template: "{brand} vs {competitor} - {decision_helper} | Flowauxi",
      emotionalTrigger: "comparison",
      characterLimit: [55, 60],
      testPriority: "high",
    },
    {
      template: "Looking for {competitor} Alternatives? {brand}. {benefit}. Compare Now.",
      emotionalTrigger: "alternatives",
      characterLimit: [55, 60],
      testPriority: "high",
    },
    {
      template: "{number} {kw} Compared (2026) - See Who Wins | Flowauxi",
      emotionalTrigger: "comparison",
      characterLimit: [50, 60],
      testPriority: "medium",
    },
    {
      template: "{brand} vs {competitor} for {audience} - {benefit} | Flowauxi",
      emotionalTrigger: "targeted",
      characterLimit: [55, 60],
      testPriority: "medium",
    },
  ],

  blog_article: [
    {
      template: "{question}? Complete Guide (2026) | Flowauxi Blog",
      emotionalTrigger: "completeness",
      characterLimit: [55, 60],
      testPriority: "high",
    },
    {
      template: "How to {topic} - Step by Step Guide | Flowauxi",
      emotionalTrigger: "how-to",
      characterLimit: [50, 60],
      testPriority: "high",
    },
    {
      template: "{topic} - {number} {noun} You Need to Know | Flowauxi",
      emotionalTrigger: "listicle",
      characterLimit: [55, 60],
      testPriority: "medium",
    },
    {
      template: "{topic} in 2026: What's Changed | Flowauxi Blog",
      emotionalTrigger: "timeliness",
      characterLimit: [50, 60],
      testPriority: "medium",
    },
  ],

  landing_page: [
    {
      template: "{primary_kw} - Start Free Today | Flowauxi",
      emotionalTrigger: "free",
      characterLimit: [45, 55],
      testPriority: "high",
    },
    {
      template: "Create Your {kw} Free - No Credit Card | Flowauxi",
      emotionalTrigger: "no commitment",
      characterLimit: [50, 60],
      testPriority: "high",
    },
    {
      template: "{primary_kw} - Join {number}+ Businesses | Flowauxi",
      emotionalTrigger: "social proof",
      characterLimit: [50, 60],
      testPriority: "medium",
    },
    {
      template: "Free {kw} - Limited Beta Access | Flowauxi",
      emotionalTrigger: "urgency",
      characterLimit: [45, 55],
      testPriority: "medium",
    },
  ],

  city_page: [
    {
      template: "{kw} in {city} - Start Free | Flowauxi",
      emotionalTrigger: "local",
      characterLimit: [50, 60],
      testPriority: "high",
    },
    {
      template: "WhatsApp Store {city} - {number}+ Businesses | Flowauxi",
      emotionalTrigger: "social proof",
      characterLimit: [50, 60],
      testPriority: "medium",
    },
    {
      template: "{city} {kw} - Trusted by Local Businesses | Flowauxi",
      emotionalTrigger: "trust",
      characterLimit: [50, 60],
      testPriority: "medium",
    },
  ],
};

// =============================================================================
// EMOTIONAL TRIGGERS
// =============================================================================

export const EMOTIONAL_TRIGGERS = {
  benefit: [
    "Save Time",
    "Make Money",
    "Save Money",
    "Grow Faster",
    "Sell More",
    "Automate Everything",
  ],
  social_proof: [
    "500+ Businesses Trust Us",
    "Join 1,000+ Businesses",
    "Trusted by 500+ Merchants",
    "Used by 10,000+ Stores",
  ],
  ease: [
    "Start in 5 Minutes",
    "No Code Required",
    "Set Up in Minutes",
    "Easy Setup",
  ],
  free: [
    "Free Forever",
    "Start Free",
    "No Credit Card Required",
    "Free Plan Available",
    "Try Free",
  ],
  urgency: [
    "Limited Time",
    "Beta Access",
    "Join Now",
    "Get Started Today",
  ],
  fear: [
    "Don't Miss Out",
    "Before It's Gone",
    "Limited Availability",
  ],
};

// =============================================================================
// META DESCRIPTION FRAMEWORKS
// =============================================================================

export const META_DESCRIPTION_FRAMEWORKS: Record<string, MetaDescriptionVariant[]> = {
  feature_page: [
    {
      template: "{primary_kw} with Flowauxi. {benefit_1}, {benefit_2}, {benefit_3}. {cta}.",
      cta: "Start free today",
      characterLimit: [140, 155],
      testPriority: "high",
    },
    {
      template: "Build your {kw} with Flowauxi. {number}+ businesses trust us. {benefit}. No credit card.",
      cta: "Try free",
      characterLimit: [140, 155],
      testPriority: "high",
    },
    {
      template: "{primary_kw}? Flowauxi makes it easy. {benefit_1} + {benefit_2}. {number}+ users. Free forever.",
      cta: "Get started free",
      characterLimit: [145, 155],
      testPriority: "medium",
    },
  ],

  comparison_page: [
    {
      template: "{brand} vs {competitor} comparison. {benefit_1}. {benefit_2}. See why {number}+ users switched.",
      cta: "See comparison",
      characterLimit: [145, 155],
      testPriority: "high",
    },
    {
      template: "Looking for {competitor} alternatives? {brand} offers {benefit_1}. Save {amount}/year. Compare now.",
      cta: "Compare pricing",
      characterLimit: [145, 155],
      testPriority: "high",
    },
    {
      template: "{brand} vs {competitor} for {audience}. Compare features, pricing, WhatsApp integration. {cta}.",
      cta: "Compare now",
      characterLimit: [140, 155],
      testPriority: "medium",
    },
  ],

  blog_article: [
    {
      template: "{question}? Complete guide with {number} examples. Learn {benefit_1} & {benefit_2}. Updated 2026.",
      cta: "Read guide",
      characterLimit: [150, 155],
      testPriority: "high",
    },
    {
      template: "How to {topic}. Step-by-step guide with screenshots. {number} min read. Flowauxi makes it easy.",
      cta: "Learn more",
      characterLimit: [145, 155],
      testPriority: "high",
    },
  ],

  city_page: [
    {
      template: "Create your free WhatsApp store in {city}. Trusted by {number}+ businesses in {state}. {benefit}. Start free.",
      cta: "Get started",
      characterLimit: [145, 155],
      testPriority: "high",
    },
    {
      template: "{kw} {city}. {number}+ orders processed. {categories}. {benefit}. Start selling on WhatsApp free.",
      cta: "Start free",
      characterLimit: [145, 155],
      testPriority: "medium",
    },
  ],
};

// =============================================================================
// RICH SNIPPETS CONFIGURATION
// =============================================================================

export const RICH_SNIPPETS_CONFIG: Record<string, RichSnippetConfig[]> = {
  feature_page: [
    { schemaType: "FAQPage", required: true, priority: "high", conditions: ["min_3_faqs", "150_word_answers"] },
    { schemaType: "SoftwareApplication", required: true, priority: "high", conditions: ["aggregate_rating", "price"] },
    { schemaType: "VideoObject", required: false, priority: "medium", conditions: ["video_present"] },
    { schemaType: "BreadcrumbList", required: true, priority: "high", conditions: [] },
  ],
  comparison_page: [
    { schemaType: "FAQPage", required: true, priority: "high", conditions: ["min_3_faqs"] },
    { schemaType: "SoftwareApplication", required: true, priority: "high", conditions: ["aggregate_rating"] },
    { schemaType: "BreadcrumbList", required: true, priority: "high", conditions: [] },
  ],
  blog_article: [
    { schemaType: "Article", required: true, priority: "high", conditions: ["author", "publish_date"] },
    { schemaType: "FAQPage", required: false, priority: "medium", conditions: ["min_3_faqs"] },
    { schemaType: "HowTo", required: false, priority: "medium", conditions: ["step_by_step"] },
    { schemaType: "BreadcrumbList", required: true, priority: "high", conditions: [] },
  ],
  city_page: [
    { schemaType: "LocalBusiness", required: true, priority: "high", conditions: ["city_data"] },
    { schemaType: "FAQPage", required: false, priority: "medium", conditions: ["min_3_faqs"] },
    { schemaType: "BreadcrumbList", required: true, priority: "high", conditions: [] },
  ],
};

// =============================================================================
// CTA CONFIGURATIONS
// =============================================================================

export const CTA_BY_INTENT: Record<SearchIntent, CTAConfig> = {
  informational: {
    primary: "Learn More",
    secondary: "Read Guide",
    placement: ["bottom", "sidebar"],
  },
  commercial: {
    primary: "Start Free Trial",
    secondary: "See Features",
    placement: ["above-fold", "middle", "bottom"],
  },
  transactional: {
    primary: "Get Started Free",
    secondary: "See Pricing",
    placement: ["top-hero", "above-fold", "after-benefits", "bottom"],
  },
  navigational: {
    primary: "Go to Dashboard",
    secondary: "Learn More",
    placement: ["top-hero"],
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate title tag variants for A/B testing
 */
export function generateTitleVariants(
  pageType: "feature_page" | "comparison_page" | "blog_article" | "landing_page" | "city_page",
  context: {
    primary_kw: string;
    brand?: string;
    benefit?: string;
    benefit_1?: string;
    benefit_2?: string;
    number?: number;
    competitor?: string;
    question?: string;
    topic?: string;
    city?: string;
    audience?: string;
  }
): string[] {
  const frameworks = TITLE_TAG_FRAMEWORKS[pageType] || [];
  const brand = context.brand || "Flowauxi";

  return frameworks
    .map((framework) => {
      let title = framework.template
        .replace("{primary_kw}", context.primary_kw)
        .replace("{brand}", brand)
        .replace("{benefit}", context.benefit || "AI Chatbot Included")
        .replace("{benefit_1}", context.benefit_1 || "AI Chatbot")
        .replace("{benefit_2}", context.benefit_2 || "Order Automation")
        .replace("{number}", String(context.number || 500))
        .replace("{competitor}", context.competitor || "Competitor")
        .replace("{question}", context.question || "How to")
        .replace("{topic}", context.topic || context.primary_kw)
        .replace("{city}", context.city || "")
        .replace("{audience}", context.audience || "India");

      // Ensure character limit
      if (title.length > framework.characterLimit[1]) {
        title = title.slice(0, framework.characterLimit[1] - 3) + "...";
      }

      return { title, framework };
    })
    .filter((item) => item.title.length >= item.framework.characterLimit[0])
    .map((item) => item.title);
}

/**
 * Generate meta description variants for A/B testing
 */
export function generateDescriptionVariants(
  pageType: "feature_page" | "comparison_page" | "blog_article" | "city_page",
  context: {
    primary_kw: string;
    benefit_1?: string;
    benefit_2?: string;
    benefit_3?: string;
    number?: number;
    competitor?: string;
    brand?: string;
    question?: string;
    topic?: string;
    city?: string;
    state?: string;
    categories?: string[];
    amount?: string;
    audience?: string;
  }
): string[] {
  const frameworks = META_DESCRIPTION_FRAMEWORKS[pageType] || [];
  const brand = context.brand || "Flowauxi";

  return frameworks
    .map((framework) => {
      let desc = framework.template
        .replace("{primary_kw}", context.primary_kw)
        .replace("{kw}", context.primary_kw.split(" ")[0])
        .replace("{brand}", brand)
        .replace("{benefit_1}", context.benefit_1 || "AI chatbot included")
        .replace("{benefit_2}", context.benefit_2 || "automated orders")
        .replace("{benefit_3}", context.benefit_3 || "free forever")
        .replace("{number}", String(context.number || 500))
        .replace("{competitor}", context.competitor || "Competitor")
        .replace("{question}", context.question || "How to")
        .replace("{topic}", context.topic || context.primary_kw)
        .replace("{city}", context.city || "Mumbai")
        .replace("{state}", context.state || "Maharashtra")
        .replace("{amount}", context.amount || "₹12,000")
        .replace("{audience}", context.audience || "India")
        .replace("{cta}", framework.cta)
        .replace("{categories}", context.categories?.slice(0, 2).join(", ") || "Fashion, Electronics");

      // Ensure character limit
      if (desc.length > framework.characterLimit[1]) {
        desc = desc.slice(0, framework.characterLimit[1] - 3) + "...";
      }

      return { desc, framework };
    })
    .filter((item) => item.desc.length >= item.framework.characterLimit[0])
    .map((item) => item.desc);
}

/**
 * Get CTA configuration for a page type
 */
export function getCTAConfig(pageType: string, intent: SearchIntent): CTAConfig {
  return CTA_BY_INTENT[intent] || CTA_BY_INTENT.commercial;
}

/**
 * Calculate estimated CTR improvement
 */
export function calculateCTRImprovement(
  currentCTR: number,
  impressions: number,
  position: number
): {
  estimatedNewCTR: number;
  additionalClicks: number;
  additionalClicksMonthly: number;
} {
  // CTR improvement factors based on position and optimization
  const ctrByPosition: Record<number, number> = {
    1: 0.398,
    2: 0.184,
    3: 0.106,
    4: 0.073,
    5: 0.053,
    6: 0.040,
    7: 0.031,
    8: 0.025,
    9: 0.021,
    10: 0.018,
  };

  const baseCTR = ctrByPosition[position] || 0.02;
  const estimatedNewCTR = baseCTR * 1.15; // 15% improvement from CTR optimization

  const additionalClicks = Math.round((estimatedNewCTR - currentCTR / 100) * impressions);
  const additionalClicksMonthly = additionalClicks * 30;

  return {
    estimatedNewCTR: estimatedNewCTR * 100,
    additionalClicks,
    additionalClicksMonthly,
  };
}

/**
 * Generate rich snippet requirements for a page
 */
export function getRichSnippetRequirements(pageType: string): {
  required: string[];
  recommended: string[];
  conditions: Record<string, string[]>;
} {
  const configs = RICH_SNIPPETS_CONFIG[pageType] || [];

  return {
    required: configs.filter((c) => c.required).map((c) => c.schemaType),
    recommended: configs.filter((c) => !c.required && c.priority === "high").map((c) => c.schemaType),
    conditions: configs.reduce(
      (acc, c) => {
        acc[c.schemaType] = c.conditions;
        return acc;
      },
      {} as Record<string, string[]>
    ),
  };
}

/**
 * Generate FAQ schema for PAA capture
 */
export function generateFaqSchemaForPAA(questions: Array<{ question: string; answer: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: q.answer,
      },
    })),
  };
}

/**
 * Validate FAQ schema for Google Rich Results
 */
export function validateFaqSchema(questions: Array<{ question: string; answer: string }>): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (questions.length < 3) {
    errors.push("FAQ page requires at least 3 questions for optimal PAA capture");
  }

  questions.forEach((q, i) => {
    if (q.question.length < 10) {
      errors.push(`Question ${i + 1} is too short (min 10 characters)`);
    }
    if (q.answer.length < 150) {
      warnings.push(`Answer ${i + 1} is short (min 150 characters recommended for PAA capture)`);
    }
    if (q.answer.length > 200) {
      warnings.push(`Answer ${i + 1} is long (max 200 characters for PAA display)`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}