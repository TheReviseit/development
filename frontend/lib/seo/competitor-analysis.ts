/**
 * Competitor Analysis for SEO Gap Strategy - FAANG Level
 * ========================================================
 *
 * This module provides competitor keyword gap analysis by reverse-engineering
 * competitor keyword portfolios and identifying content gaps.
 *
 * FAANG Principle: Analyze what competitors rank for and identify the exact
 * content gaps where Flowauxi can win with less effort.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface CompetitorData {
  name: string;
  domain: string;
  monthlyTraffic: number;
  rankingKeywords: number;
  topKeywords: CompetitorKeyword[];
  contentGaps: string[];
  strengths: string[];
  weaknesses: string[];
  ourOpportunity: string;
}

export interface CompetitorKeyword {
  keyword: string;
  volume: number;
  position: number;
  url: string;
  intent: "informational" | "commercial" | "transactional" | "navigational";
}

export interface KeywordGap {
  keyword: string;
  volume: number;
  difficulty: number;
  competitorPositions: Record<string, number>; // competitor -> position
  ourPosition: number | null; // null if we don't rank
  opportunity: "high" | "medium" | "low";
  recommendedAction: string;
}

export interface ContentGap {
  topic: string;
  competitorHas: boolean;
  weHave: boolean;
  priority: "immediate" | "high" | "medium" | "low";
  estimatedTraffic: number;
  recommendedUrl: string;
}

// =============================================================================
// COMPETITOR DATA
// =============================================================================

export const COMPETITORS: CompetitorData[] = [
  {
    name: "Dukaan",
    domain: "dukaan.co",
    monthlyTraffic: 500000,
    rankingKeywords: 8500,
    topKeywords: [
      { keyword: "dukaan", volume: 50000, position: 1, url: "/", intent: "navigational" },
      { keyword: "online store builder", volume: 12000, position: 3, url: "/", intent: "commercial" },
      { keyword: "create online store", volume: 18000, position: 5, url: "/", intent: "commercial" },
      { keyword: "free website builder", volume: 22000, position: 8, url: "/", intent: "commercial" },
      { keyword: "ecommerce platform india", volume: 6500, position: 4, url: "/", intent: "commercial" },
    ],
    contentGaps: [
      "WhatsApp Business API content",
      "AI chatbot features",
      "Invoice automation content",
      "Comparison pages (vs competitors)",
      "City/industry programmatic pages",
      "Order tracking content",
      "Google Sheets integration guides",
    ],
    strengths: [
      "Strong brand awareness in India",
      "Good SEO for 'online store builder'",
      "Active content production",
      "Comparison pages with competitors",
    ],
    weaknesses: [
      "No WhatsApp-native positioning",
      "No AI chatbot built-in",
      "No invoice automation content",
      "Limited programmatic SEO",
      "Weak comparison pages",
    ],
    ourOpportunity: "Position as WhatsApp-native alternative with AI chatbot included free",
  },
  {
    name: "Wati",
    domain: "wati.io",
    monthlyTraffic: 200000,
    rankingKeywords: 4200,
    topKeywords: [
      { keyword: "wati", volume: 30000, position: 1, url: "/", intent: "navigational" },
      { keyword: "whatsapp chatbot", volume: 33000, position: 5, url: "/", intent: "commercial" },
      { keyword: "whatsapp api", volume: 22000, position: 8, url: "/", intent: "commercial" },
      { keyword: "whatsapp business api", volume: 22000, position: 10, url: "/", intent: "commercial" },
      { keyword: "whatsapp automation", volume: 27000, position: 6, url: "/", intent: "commercial" },
    ],
    contentGaps: [
      "E-commerce store builder content",
      "Invoice/order automation content",
      "Payment integration guides",
      "Free plan landing pages",
      "Industry/vertical content",
      "Comparison pages (vs store builders)",
    ],
    strengths: [
      "Strong WhatsApp API positioning",
      "Good chatbot content",
      "WhatsApp automation guides",
      "Technical documentation",
    ],
    weaknesses: [
      "No store builder content",
      "No e-commerce features",
      "Limited India-specific content",
      "No free plan positioning",
      "Weak comparison pages",
    ],
    ourOpportunity: "Add e-commerce layer on top of WhatsApp API, position as complete solution",
  },
  {
    name: "Interakt",
    domain: "interakt.shop",
    monthlyTraffic: 150000,
    rankingKeywords: 3500,
    topKeywords: [
      { keyword: "interakt", volume: 20000, position: 1, url: "/", intent: "navigational" },
      { keyword: "whatsapp business api pricing", volume: 3300, position: 5, url: "/pricing", intent: "commercial" },
      { keyword: "whatsapp chatbot for business", volume: 14000, position: 8, url: "/", intent: "commercial" },
      { keyword: "bulk whatsapp messaging", volume: 2400, position: 6, url: "/", intent: "commercial" },
    ],
    contentGaps: [
      "Store builder content",
      "Invoice automation content",
      "Comparison pages",
      "Free plan landing pages",
      "Local India content",
      "Order tracking content",
    ],
    strengths: [
      "Good WhatsApp API pricing content",
      "Bulk messaging guides",
      "Business API documentation",
    ],
    weaknesses: [
      "Weak e-commerce positioning",
      "No store builder",
      "Limited feature content",
      "No free tier positioning",
    ],
    ourOpportunity: "Position as free alternative with more features built-in",
  },
  {
    name: "Shopify",
    domain: "shopify.com",
    monthlyTraffic: 50000000,
    rankingKeywords: 1200000,
    topKeywords: [
      { keyword: "shopify", volume: 500000, position: 1, url: "/", intent: "navigational" },
      { keyword: "online store", volume: 100000, position: 3, url: "/", intent: "commercial" },
      { keyword: "ecommerce platform", volume: 50000, position: 2, url: "/", intent: "commercial" },
      { keyword: "website builder", volume: 80000, position: 5, url: "/", intent: "commercial" },
    ],
    contentGaps: [
      "WhatsApp-centric content",
      "India-specific pricing/landing",
      "Free forever plan",
      "D2C WhatsApp-first messaging",
      "AI chatbot included content",
    ],
    strengths: [
      "Massive brand authority",
      "Excellent SEO foundation",
      "Huge content library",
      "Strong domain authority",
    ],
    weaknesses: [
      "No WhatsApp-native positioning",
      "India pricing not highlighted",
      "No AI chatbot included",
      "App install required for WhatsApp",
    ],
    ourOpportunity: "Target 'whatsapp store builder' and 'free forever' keywords Shopify doesn't target",
  },
];

// =============================================================================
// KEYWORD GAP ANALYSIS
// =============================================================================

/**
 * Keywords where Flowauxi has NO competition but high opportunity
 */
export const BLUE_OCEAN_KEYWORDS: KeywordGap[] = [
  {
    keyword: "whatsapp store builder",
    volume: 12000,
    difficulty: 25,
    competitorPositions: {},
    ourPosition: null,
    opportunity: "high",
    recommendedAction: "CREATE PILLAR PAGE IMMEDIATELY - No direct competition",
  },
  {
    keyword: "whatsapp order automation",
    volume: 880,
    difficulty: 20,
    competitorPositions: {},
    ourPosition: null,
    opportunity: "high",
    recommendedAction: "CREATE FEATURE PAGE - Unique positioning",
  },
  {
    keyword: "ai chatbot for ecommerce free",
    volume: 720,
    difficulty: 30,
    competitorPositions: { Wati: 15 },
    ourPosition: null,
    opportunity: "high",
    recommendedAction: "CREATE FEATURE PAGE emphasizing FREE",
  },
  {
    keyword: "sell on whatsapp without website",
    volume: 1600,
    difficulty: 25,
    competitorPositions: {},
    ourPosition: null,
    opportunity: "high",
    recommendedAction: "CREATE BLOG ARTICLE - Unique value prop",
  },
  {
    keyword: "whatsapp invoice generator",
    volume: 720,
    difficulty: 15,
    competitorPositions: {},
    ourPosition: null,
    opportunity: "high",
    recommendedAction: "CREATE FEATURE PAGE - No competition",
  },
  {
    keyword: "free whatsapp store forever",
    volume: 320,
    difficulty: 20,
    competitorPositions: {},
    ourPosition: null,
    opportunity: "high",
    recommendedAction: "CREATE LANDING PAGE - Unique positioning",
  },
  {
    keyword: "whatsapp store mumbai",
    volume: 50,
    difficulty: 10,
    competitorPositions: {},
    ourPosition: null,
    opportunity: "medium",
    recommendedAction: "CREATE PROGRAMMATIC CITY PAGE",
  },
  {
    keyword: "shopify alternatives for whatsapp",
    volume: 120,
    difficulty: 25,
    competitorPositions: {},
    ourPosition: null,
    opportunity: "high",
    recommendedAction: "CREATE COMPARISON PAGE - Strong positioning",
  },
];

/**
 * Keywords where competitors rank but Flowauxi can win
 */
export const COMPETITIVE_KEYWORDS: KeywordGap[] = [
  {
    keyword: "online store builder",
    volume: 12000,
    difficulty: 45,
    competitorPositions: { Dukaan: 3, Shopify: 2 },
    ourPosition: null,
    opportunity: "medium",
    recommendedAction: "CREATE FEATURE PAGE with WhatsApp differentiation",
  },
  {
    keyword: "free website builder",
    volume: 22000,
    difficulty: 50,
    competitorPositions: { Dukaan: 8, Shopify: 15 },
    ourPosition: null,
    opportunity: "medium",
    recommendedAction: "CREATE COMPARISON PAGE emphasizing FREE + WhatsApp",
  },
  {
    keyword: "whatsapp chatbot for business",
    volume: 14000,
    difficulty: 40,
    competitorPositions: { Wati: 5, Interakt: 8 },
    ourPosition: null,
    opportunity: "medium",
    recommendedAction: "MATCH competitor content + add FREE tier",
  },
  {
    keyword: "whatsapp business api pricing",
    volume: 3300,
    difficulty: 35,
    competitorPositions: { Wati: 6, Interakt: 5 },
    ourPosition: null,
    opportunity: "medium",
    recommendedAction: "CREATE pricing page with transparent pricing",
  },
  {
    keyword: "best whatsapp chatbot",
    volume: 6500,
    difficulty: 35,
    competitorPositions: { Wati: 8, Interakt: 12 },
    ourPosition: null,
    opportunity: "medium",
    recommendedAction: "CREATE COMPARISON PAGE ranking ourselves #1",
  },
];

// =============================================================================
// CONTENT GAPS
// =============================================================================

export const CONTENT_GAPS: ContentGap[] = [
  {
    topic: "WhatsApp Store Builder",
    competitorHas: false,
    weHave: true,
    priority: "immediate",
    estimatedTraffic: 12000,
    recommendedUrl: "/features/whatsapp-store",
  },
  {
    topic: "AI Chatbot Included Free",
    competitorHas: false,
    weHave: true,
    priority: "immediate",
    estimatedTraffic: 5000,
    recommendedUrl: "/features/ai-chatbot",
  },
  {
    topic: "Invoice Automation",
    competitorHas: false,
    weHave: true,
    priority: "high",
    estimatedTraffic: 2000,
    recommendedUrl: "/features/invoice-automation",
  },
  {
    topic: "Order Tracking via WhatsApp",
    competitorHas: false,
    weHave: true,
    priority: "high",
    estimatedTraffic: 1500,
    recommendedUrl: "/features/order-tracking",
  },
  {
    topic: "Google Sheets Sync",
    competitorHas: false,
    weHave: true,
    priority: "medium",
    estimatedTraffic: 800,
    recommendedUrl: "/features/google-sheets-sync",
  },
  {
    topic: "Comparison vs Shopify",
    competitorHas: true,
    weHave: false,
    priority: "immediate",
    estimatedTraffic: 3000,
    recommendedUrl: "/compare/shopify",
  },
  {
    topic: "Comparison vs Dukaan",
    competitorHas: true,
    weHave: false,
    priority: "immediate",
    estimatedTraffic: 2000,
    recommendedUrl: "/compare/dukaan",
  },
  {
    topic: "Comparison vs Wati",
    competitorHas: true,
    weHave: false,
    priority: "high",
    estimatedTraffic: 1500,
    recommendedUrl: "/compare/wati",
  },
  {
    topic: "City Pages (Programmatic)",
    competitorHas: false,
    weHave: false,
    priority: "medium",
    estimatedTraffic: 5000,
    recommendedUrl: "/whatsapp-store/[city]",
  },
  {
    topic: "Industry Pages (Programmatic)",
    competitorHas: false,
    weHave: false,
    priority: "medium",
    estimatedTraffic: 3000,
    recommendedUrl: "/ecommerce/[industry]",
  },
  {
    topic: "WhatsApp Business API Guide",
    competitorHas: true,
    weHave: false,
    priority: "high",
    estimatedTraffic: 6000,
    recommendedUrl: "/blog/whatsapp-business-api-guide",
  },
  {
    topic: "WhatsApp Marketing Guide",
    competitorHas: true,
    weHave: false,
    priority: "medium",
    estimatedTraffic: 4000,
    recommendedUrl: "/blog/whatsapp-marketing-guide",
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get content gaps sorted by priority
 */
export function getSortedContentGaps(): ContentGap[] {
  const priorityOrder = { immediate: 0, high: 1, medium: 2, low: 3 };
  return [...CONTENT_GAPS].sort(
    (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
  );
}

/**
 * Get high-opportunity keywords (no competition)
 */
export function getBlueOceanKeywords(): KeywordGap[] {
  return BLUE_OCEAN_KEYWORDS.filter((k) => k.opportunity === "high");
}

/**
 * Get competitive keywords (need to outrank competitors)
 */
export function getCompetitiveKeywords(): KeywordGap[] {
  return COMPETITIVE_KEYWORDS;
}

/**
 * Calculate keyword opportunity score
 */
export function calculateOpportunityScore(gap: KeywordGap): number {
  const volumeScore = Math.min(gap.volume / 1000, 10);
  const difficultyScore = (100 - gap.difficulty) / 10;
  const competitionScore = Object.keys(gap.competitorPositions).length === 0 ? 10 : 5;
  const ourPositionScore = gap.ourPosition === null ? 0 : (11 - gap.ourPosition);

  return volumeScore + difficultyScore + competitionScore + ourPositionScore;
}

/**
 * Get recommended content for a keyword gap
 */
export function getRecommendedContent(gap: KeywordGap): {
  type: "feature_page" | "blog_article" | "comparison_page" | "landing_page";
  template: string;
  wordCount: [number, number];
} {
  if (gap.keyword.includes("vs ") || gap.keyword.includes("alternatives")) {
    return {
      type: "comparison_page",
      template: "/compare/{competitor}",
      wordCount: [2500, 3500],
    };
  }

  if (gap.keyword.includes("how to") || gap.keyword.includes("guide")) {
    return {
      type: "blog_article",
      template: "/blog/{slug}",
      wordCount: [2500, 3500],
    };
  }

  if (gap.keyword.includes("builder") || gap.keyword.includes("automation")) {
    return {
      type: "feature_page",
      template: "/features/{feature}",
      wordCount: [3500, 5000],
    };
  }

  return {
    type: "landing_page",
    template: "/{slug}",
    wordCount: [1500, 2500],
  };
}

/**
 * Get competitor positioning to use in comparison pages
 */
export function getCompetitorPositioning(competitorName: string): {
  strengths: string[];
  weaknesses: string[];
  ourDifferentiators: string[];
} {
  const competitor = COMPETITORS.find((c) => c.name.toLowerCase() === competitorName.toLowerCase());
  if (!competitor) {
    return { strengths: [], weaknesses: [], ourDifferentiators: [] };
  }

  return {
    strengths: competitor.strengths,
    weaknesses: competitor.weaknesses,
    ourDifferentiators: [
      "WhatsApp-native from day one",
      "AI Chatbot included free",
      "Invoice automation built-in",
      "Order tracking via WhatsApp",
      "Free forever plan",
      "India-focused pricing",
      "No app installs required",
    ],
  };
}

/**
 * Generate comparison table data for competitor
 */
export function generateComparisonData(competitorName: string): {
  features: { feature: string; us: string; them: string; winner: "us" | "them" | "tie" }[];
  pricing: { plan: string; us: string; them: string };
  integrations: { integration: string; us: boolean; them: boolean }[];
} {
  const comparisons: Record<string, { features: string[]; pricing: string; integrations: string[] }> = {
    Dukaan: {
      features: ["Online store", "Payment integration", "D2C focused"],
      pricing: "₹1,499/month starting",
      integrations: ["Razorpay", "Paytm"],
    },
    Wati: {
      features: ["WhatsApp API", "Chatbot", "Broadcast"],
      pricing: "₹999/month starting",
      integrations: ["WhatsApp Business API"],
    },
    Interakt: {
      features: ["WhatsApp API", "Bulk messaging", "Chatbot"],
      pricing: "₹999/month starting",
      integrations: ["WhatsApp Business API"],
    },
    Shopify: {
      features: ["E-commerce", "Payments", "Apps", "Themes"],
      pricing: "₹1,499/month starting",
      integrations: ["Thousands of apps"],
    },
  };

  const data = comparisons[competitorName];
  if (!data) {
    return {
      features: [],
      pricing: { plan: "Free", us: "Free", them: "Paid" },
      integrations: [],
    };
  }

  return {
    features: [
      { feature: "WhatsApp Store", us: "✓ Native", them: data.features.includes("WhatsApp Store") ? "✓" : "✗ Requires app", winner: "us" },
      { feature: "AI Chatbot", us: "✓ Included Free", them: data.features.includes("Chatbot") ? "✓ Paid" : "✗", winner: "us" },
      { feature: "Invoice Automation", us: "✓ Built-in", them: "✗", winner: "us" },
      { feature: "Order Tracking", us: "✓ WhatsApp", them: "✗", winner: "us" },
      { feature: "Payment Integration", us: "✓ Razorpay, Stripe", them: data.integrations.join(", ") || "✗", winner: data.integrations.length > 1 ? "tie" : "us" },
      { feature: "Google Sheets Sync", us: "✓ Free", them: "✗", winner: "us" },
      { feature: "Free Plan", us: "✓ Forever Free", them: "✗ Trial only", winner: "us" },
    ],
    pricing: {
      plan: "Starting Price",
      us: "Free Forever",
      them: data.pricing,
    },
    integrations: [
      { integration: "WhatsApp Business API", us: true, them: data.integrations.includes("WhatsApp Business API") },
      { integration: "Razorpay", us: true, them: data.integrations.includes("Razorpay") },
      { integration: "Stripe", us: true, them: data.integrations.includes("Stripe") },
      { integration: "Google Sheets", us: true, them: false },
    ],
  };
}