/**
 * Search Intent Matrix - FAANG Level SEO
 * ========================================
 *
 * This module maps keywords to search intent, content format, and page templates.
 * FAANG Principle: Build intent matrices before writing content to ensure
 * each keyword gets the right content format to satisfy user intent.
 *
 * @see https://developers.google.com/search/docs/fundamentals/how-search-works/intent-matching
 */

import type { SearchIntent, ContentFormat } from "./entity-graph";

// =============================================================================
// KEYWORD INTENT MAPPING
// =============================================================================

export interface KeywordIntentMapping {
  keyword: string;
  volume: number;
  difficulty: number; // 0-100
  intent: SearchIntent;
  contentFormat: ContentFormat;
  pageTemplate: string;
  wordCount: [min: number, max: number];
  mediaRequirements: MediaRequirement[];
  schema: SchemaType[];
  ctaPlacements: CTAType[];
  internalLinkDensity: number;
  priority: "immediate" | "high" | "medium" | "low";
  competitorGap: boolean; // True if competitors don't rank for this
}

interface MediaRequirement {
  type: "image" | "video" | "infographic" | "screenshot" | "table" | "chart";
  minCount: number;
  purpose: string;
}

type SchemaType =
  | "Article"
  | "HowTo"
  | "FAQPage"
  | "Product"
  | "SoftwareApplication"
  | "ComparisonTable"
  | "VideoObject"
  | "BreadcrumbList"
  | "LocalBusiness"
  | "Organization";

type CTAType =
  | "top-hero"
  | "above-fold"
  | "after-intro"
  | "middle"
  | "after-benefits"
  | "after-comparison"
  | "after-pricing"
  | "bottom"
  | "sidebar"
  | "floating";

// =============================================================================
// INTENT CLASSIFICATION MATRIX
// =============================================================================

export const INTENT_MATRIX: KeywordIntentMapping[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // IMMEDIATE PRIORITY - High Volume, Low Competition, No Competitor Focus
  // ═══════════════════════════════════════════════════════════════════════════

  {
    keyword: "whatsapp store builder",
    volume: 12000,
    difficulty: 25,
    intent: "commercial",
    contentFormat: "feature_showcase",
    pageTemplate: "/features/whatsapp-store",
    wordCount: [4000, 6000],
    mediaRequirements: [
      { type: "screenshot", minCount: 8, purpose: "Feature demo" },
      { type: "video", minCount: 1, purpose: "Product walkthrough" },
      { type: "infographic", minCount: 2, purpose: "Benefits visualization" },
      { type: "table", minCount: 2, purpose: "Feature comparison" },
    ],
    schema: ["SoftwareApplication", "FAQPage", "VideoObject"],
    ctaPlacements: ["top-hero", "after-intro", "middle", "bottom"],
    internalLinkDensity: 12,
    priority: "immediate",
    competitorGap: true,
  },

  {
    keyword: "free online store builder india",
    volume: 22000,
    difficulty: 45,
    intent: "commercial",
    contentFormat: "feature_showcase",
    pageTemplate: "/features/whatsapp-store",
    wordCount: [3500, 5000],
    mediaRequirements: [
      { type: "screenshot", minCount: 6, purpose: "Feature demo" },
      { type: "infographic", minCount: 1, purpose: "Pricing comparison" },
      { type: "video", minCount: 1, purpose: "Quick demo" },
    ],
    schema: ["SoftwareApplication", "FAQPage"],
    ctaPlacements: ["top-hero", "after-benefits", "bottom"],
    internalLinkDensity: 10,
    priority: "immediate",
    competitorGap: false,
  },

  {
    keyword: "whatsapp order automation",
    volume: 880,
    difficulty: 20,
    intent: "commercial",
    contentFormat: "how_to_guide",
    pageTemplate: "/blog/whatsapp-order-automation",
    wordCount: [2500, 3500],
    mediaRequirements: [
      { type: "screenshot", minCount: 8, purpose: "Step-by-step" },
      { type: "video", minCount: 1, purpose: "Tutorial" },
      { type: "table", minCount: 1, purpose: "Process overview" },
    ],
    schema: ["HowTo", "FAQPage"],
    ctaPlacements: ["after-intro", "bottom"],
    internalLinkDensity: 8,
    priority: "immediate",
    competitorGap: true,
  },

  {
    keyword: "ai chatbot for online store",
    volume: 1200,
    difficulty: 30,
    intent: "commercial",
    contentFormat: "feature_showcase",
    pageTemplate: "/features/ai-chatbot",
    wordCount: [3500, 5000],
    mediaRequirements: [
      { type: "screenshot", minCount: 6, purpose: "Chatbot demo" },
      { type: "video", minCount: 1, purpose: "AI capabilities" },
      { type: "infographic", minCount: 1, purpose: "ROI visualization" },
    ],
    schema: ["SoftwareApplication", "FAQPage"],
    ctaPlacements: ["top-hero", "middle", "bottom"],
    internalLinkDensity: 10,
    priority: "immediate",
    competitorGap: true,
  },

  {
    keyword: "sell on whatsapp without website",
    volume: 1600,
    difficulty: 25,
    intent: "informational",
    contentFormat: "how_to_guide",
    pageTemplate: "/blog/sell-on-whatsapp-without-website",
    wordCount: [2500, 3500],
    mediaRequirements: [
      { type: "screenshot", minCount: 6, purpose: "Step-by-step" },
      { type: "video", minCount: 1, purpose: "Setup guide" },
    ],
    schema: ["HowTo", "FAQPage"],
    ctaPlacements: ["bottom"],
    internalLinkDensity: 8,
    priority: "immediate",
    competitorGap: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HIGH PRIORITY - Medium Volume, Low-Medium Competition
  // ═══════════════════════════════════════════════════════════════════════════

  {
    keyword: "whatsapp invoice generator",
    volume: 720,
    difficulty: 15,
    intent: "commercial",
    contentFormat: "feature_showcase",
    pageTemplate: "/features/invoice-automation",
    wordCount: [2500, 4000],
    mediaRequirements: [
      { type: "screenshot", minCount: 4, purpose: "Invoice demo" },
      { type: "infographic", minCount: 1, purpose: "Invoice workflow" },
    ],
    schema: ["SoftwareApplication", "FAQPage"],
    ctaPlacements: ["top-hero", "middle", "bottom"],
    internalLinkDensity: 8,
    priority: "high",
    competitorGap: true,
  },

  {
    keyword: "whatsapp business api cost india",
    volume: 3300,
    difficulty: 40,
    intent: "informational",
    contentFormat: "blog_article",
    pageTemplate: "/blog/whatsapp-business-api-cost",
    wordCount: [3000, 4000],
    mediaRequirements: [
      { type: "table", minCount: 3, purpose: "Pricing breakdown" },
      { type: "chart", minCount: 2, purpose: "Cost comparison" },
    ],
    schema: ["Article", "FAQPage"],
    ctaPlacements: ["bottom"],
    internalLinkDensity: 6,
    priority: "high",
    competitorGap: false,
  },

  {
    keyword: "best whatsapp chatbot for e-commerce",
    volume: 1200,
    difficulty: 35,
    intent: "commercial",
    contentFormat: "comparison_table",
    pageTemplate: "/blog/best-whatsapp-chatbot-ecommerce",
    wordCount: [2500, 3500],
    mediaRequirements: [
      { type: "table", minCount: 2, purpose: "Comparison" },
      { type: "infographic", minCount: 1, purpose: "Feature matrix" },
    ],
    schema: ["ComparisonTable", "FAQPage"],
    ctaPlacements: ["after-intro", "bottom"],
    internalLinkDensity: 10,
    priority: "high",
    competitorGap: false,
  },

  {
    keyword: "flowauxi vs shopify",
    volume: 480,
    difficulty: 20,
    intent: "commercial",
    contentFormat: "comparison_table",
    pageTemplate: "/compare/shopify",
    wordCount: [2500, 3500],
    mediaRequirements: [
      { type: "table", minCount: 3, purpose: "Feature/price comparison" },
      { type: "infographic", minCount: 1, purpose: "Visual comparison" },
      { type: "screenshot", minCount: 4, purpose: "Side-by-side" },
    ],
    schema: ["ComparisonTable", "FAQPage"],
    ctaPlacements: ["after-intro", "after-comparison", "bottom"],
    internalLinkDensity: 15,
    priority: "high",
    competitorGap: true,
  },

  {
    keyword: "dukaan alternatives",
    volume: 890,
    difficulty: 15,
    intent: "commercial",
    contentFormat: "comparison_table",
    pageTemplate: "/compare/dukaan",
    wordCount: [2000, 3000],
    mediaRequirements: [
      { type: "table", minCount: 2, purpose: "Comparison" },
    ],
    schema: ["ComparisonTable", "FAQPage"],
    ctaPlacements: ["after-intro", "bottom"],
    internalLinkDensity: 12,
    priority: "high",
    competitorGap: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIUM PRIORITY - Volume with Some Competition
  // ═══════════════════════════════════════════════════════════════════════════

  {
    keyword: "whatsapp chatbot pricing",
    volume: 880,
    difficulty: 35,
    intent: "commercial",
    contentFormat: "pricing_page",
    pageTemplate: "/pricing",
    wordCount: [1500, 2500],
    mediaRequirements: [
      { type: "table", minCount: 2, purpose: "Pricing comparison" },
      { type: "infographic", minCount: 1, purpose: "Value visualization" },
    ],
    schema: ["SoftwareApplication"],
    ctaPlacements: ["top-hero", "after-pricing", "bottom"],
    internalLinkDensity: 6,
    priority: "medium",
    competitorGap: false,
  },

  {
    keyword: "create online store free",
    volume: 18000,
    difficulty: 50,
    intent: "transactional",
    contentFormat: "landing_page",
    pageTemplate: "/signup",
    wordCount: [1000, 2000],
    mediaRequirements: [
      { type: "screenshot", minCount: 2, purpose: "Product preview" },
      { type: "video", minCount: 1, purpose: "Quick demo" },
    ],
    schema: ["SoftwareApplication"],
    ctaPlacements: ["top-hero", "above-fold", "after-benefits", "bottom"],
    internalLinkDensity: 5,
    priority: "medium",
    competitorGap: false,
  },

  {
    keyword: "what is whatsapp e-commerce",
    volume: 6500,
    difficulty: 35,
    intent: "informational",
    contentFormat: "pillar_guide",
    pageTemplate: "/blog/what-is-whatsapp-ecommerce",
    wordCount: [3500, 5000],
    mediaRequirements: [
      { type: "infographic", minCount: 2, purpose: "Concept explanation" },
      { type: "screenshot", minCount: 5, purpose: "Product demo" },
      { type: "video", minCount: 1, purpose: "Overview walkthrough" },
    ],
    schema: ["Article", "FAQPage", "VideoObject"],
    ctaPlacements: ["bottom", "sidebar"],
    internalLinkDensity: 8,
    priority: "medium",
    competitorGap: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PROGRAMMATIC PRIORITY - City Pages
  // ═══════════════════════════════════════════════════════════════════════════

  {
    keyword: "whatsapp store mumbai",
    volume: 50,
    difficulty: 10,
    intent: "commercial",
    contentFormat: "city_page",
    pageTemplate: "/whatsapp-store/[city]",
    wordCount: [800, 1200],
    mediaRequirements: [
      { type: "image", minCount: 1, purpose: "City store" },
    ],
    schema: ["LocalBusiness", "FAQPage"],
    ctaPlacements: ["top-hero", "bottom"],
    internalLinkDensity: 8,
    priority: "medium",
    competitorGap: true,
  },

  {
    keyword: "whatsapp store delhi",
    volume: 45,
    difficulty: 10,
    intent: "commercial",
    contentFormat: "city_page",
    pageTemplate: "/whatsapp-store/[city]",
    wordCount: [800, 1200],
    mediaRequirements: [
      { type: "image", minCount: 1, purpose: "City store" },
    ],
    schema: ["LocalBusiness", "FAQPage"],
    ctaPlacements: ["top-hero", "bottom"],
    internalLinkDensity: 8,
    priority: "medium",
    competitorGap: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INDUSTRY PAGES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    keyword: "whatsapp store for fashion",
    volume: 320,
    difficulty: 20,
    intent: "commercial",
    contentFormat: "industry_page",
    pageTemplate: "/ecommerce/[industry]",
    wordCount: [1000, 1500],
    mediaRequirements: [
      { type: "screenshot", minCount: 2, purpose: "Fashion demo" },
      { type: "infographic", minCount: 1, purpose: "Industry stats" },
    ],
    schema: ["Article", "LocalBusiness"],
    ctaPlacements: ["top-hero", "middle", "bottom"],
    internalLinkDensity: 10,
    priority: "medium",
    competitorGap: true,
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get keywords by intent type
 */
export function getKeywordsByIntent(intent: SearchIntent): KeywordIntentMapping[] {
  return INTENT_MATRIX.filter((k) => k.intent === intent);
}

/**
 * Get keywords by priority
 */
export function getKeywordsByPriority(priority: "immediate" | "high" | "medium" | "low"): KeywordIntentMapping[] {
  return INTENT_MATRIX.filter((k) => k.priority === priority);
}

/**
 * Get keywords by content format
 */
export function getKeywordsByFormat(format: ContentFormat): KeywordIntentMapping[] {
  return INTENT_MATRIX.filter((k) => k.contentFormat === format);
}

/**
 * Get keyword opportunities (high volume, low competition, competitor gap)
 */
export function getKeywordOpportunities(): KeywordIntentMapping[] {
  return INTENT_MATRIX.filter(
    (k) => k.competitorGap && (k.priority === "immediate" || k.priority === "high")
  );
}

/**
 * Get keyword by URL template
 */
export function getKeywordByTemplate(template: string): KeywordIntentMapping | undefined {
  return INTENT_MATRIX.find((k) => k.pageTemplate === template);
}

/**
 * Get content requirements for a keyword
 */
export function getContentRequirements(keyword: string): {
  wordCount: [number, number];
  mediaCount: number;
  schema: string[];
  internalLinks: number;
} {
  const mapping = INTENT_MATRIX.find((k) => k.keyword === keyword);
  if (!mapping) {
    return {
      wordCount: [1500, 2500],
      mediaCount: 3,
      schema: ["Article"],
      internalLinks: 5,
    };
  }

  const mediaCount = mapping.mediaRequirements.reduce((sum, req) => sum + req.minCount, 0);

  return {
    wordCount: mapping.wordCount,
    mediaCount,
    schema: mapping.schema,
    internalLinks: mapping.internalLinkDensity,
  };
}

/**
 * Calculate keyword difficulty score (0-100)
 */
export function calculateKeywordScore(keyword: KeywordIntentMapping): number {
  const volumeScore = Math.min(keyword.volume / 1000, 10); // Max 10
  const difficultyScore = (100 - keyword.difficulty) / 10; // Max 10 (lower difficulty = higher score)
  const competitorGapScore = keyword.competitorGap ? 10 : 5; // 10 or 5
  const priorityScore = keyword.priority === "immediate" ? 10 : keyword.priority === "high" ? 7 : 4;

  return volumeScore + difficultyScore + competitorGapScore + priorityScore;
}

/**
 * Get recommended content cluster for a keyword
 */
export function getRecommendedCluster(keyword: string): {
  pillarKeywords: string[];
  clusterKeywords: string[];
  internalLinks: string[];
} {
  const mapping = INTENT_MATRIX.find((k) => k.keyword === keyword);
  if (!mapping) {
    return { pillarKeywords: [], clusterKeywords: [], internalLinks: [] };
  }

  // Find related keywords based on similar content format and intent
  const related = INTENT_MATRIX.filter(
    (k) =>
      k.keyword !== keyword &&
      (k.contentFormat === mapping.contentFormat || k.intent === mapping.intent)
  ).slice(0, 10);

  return {
    pillarKeywords: related.filter((k) => k.contentFormat === "pillar_guide").map((k) => k.keyword),
    clusterKeywords: related.slice(0, 8).map((k) => k.keyword),
    internalLinks: related.slice(0, 15).map((k) => k.pageTemplate),
  };
}

/**
 * Generate CTA configuration for a keyword
 */
export function getCTAConfiguration(keyword: string): {
  placements: CTAType[];
  primaryCTA: string;
  secondaryCTA: string;
} {
  const mapping = INTENT_MATRIX.find((k) => k.keyword === keyword);
  if (!mapping) {
    return {
      placements: ["bottom"],
      primaryCTA: "Get Started Free",
      secondaryCTA: "Learn More",
    };
  }

  const ctaByIntent: Record<SearchIntent, { primary: string; secondary: string }> = {
    informational: {
      primary: "Learn More",
      secondary: "Read Guide",
    },
    commercial: {
      primary: "Start Free Trial",
      secondary: "See Features",
    },
    transactional: {
      primary: "Get Started Free",
      secondary: "See Pricing",
    },
    navigational: {
      primary: "Go to Dashboard",
      secondary: "Learn More",
    },
  };

  return {
    placements: mapping.ctaPlacements,
    primaryCTA: ctaByIntent[mapping.intent].primary,
    secondaryCTA: ctaByIntent[mapping.intent].secondary,
  };
}

/**
 * Export intent matrix for use in other modules
 */
export const getIntentMatrix = () => INTENT_MATRIX;