/**
 * Entity Definition — Single Source of Truth
 * ===========================================
 *
 * This module is THE ONLY place where review/rating data,
 * entity mappings, and verifiable metrics are defined.
 *
 * CRITICAL RULES:
 *   - ENABLE_REVIEWS is the ONLY toggle for AggregateRating schemas.
 *     It is checked by every schema generator. Flip to true ONLY after
 *     20+ verified reviews exist on G2/Capterra.
 *   - getReviewRating() returns null when reviews are disabled.
 *     The type system enforces null-checking. No fallback fabricated numbers.
 *   - ORGANIZATION_SAME_AS must contain only active, indexed profile URLs.
 *     Remove any URL that doesn't resolve.
 *   - WIKIDATA_IDS.flowauxi is a placeholder. Replace with real Q-item
 *     after Wikidata registration (external task 0K).
 *
 * @see Phase 0 SEO Execution Plan v3.0
 */

// =============================================================================
// REVIEW RATING TOGGLE — SINGLE SOURCE OF TRUTH
// =============================================================================

/**
 * Whether to include AggregateRating in ANY schema output.
 *
 * CURRENTLY DISABLED — do not enable until:
 *   1. Flowauxi has 20+ verified reviews on G2 (g2.com/products/flowauxi)
 *   2. OR Flowauxi has 20+ verified reviews on Capterra
 *   3. The ratingValue and ratingCount below are updated to match real data
 *
 * Google's structured data guidelines prohibit self-serving AggregateRating
 * without third-party review data. Shipping fabricated ratings risks a
 * manual action penalty.
 *
 * When flipping this to true:
 *   - Update ratingValue to match actual G2/Capterra average
 *   - Update ratingCount to match actual review count
 *   - Verify on Google Rich Results Test that the schema renders correctly
 */
export const ENABLE_REVIEWS = false as const;

/**
 * Review rating data. Returns null when ENABLE_REVIEWS is false.
 *
 * USAGE: Every schema generator that produces AggregateRating MUST call
 * this function and guard on null. The type system enforces this —
 * the return type includes null, so callers MUST handle the null case.
 *
 * There is NO fallback with fabricated numbers. If this returns null,
 * no AggregateRating is included in any schema. Period.
 */
export function getReviewRating(): {
  ratingValue: string;
  ratingCount: string;
  bestRating: string;
} | null {
  if (!ENABLE_REVIEWS) return null;

  // TODO: Update these values to match G2/Capterra after verification
  return {
    ratingValue: "4.8",
    ratingCount: "500",
    bestRating: "5",
  };
}

// =============================================================================
// VERIFIABLE METRICS — NO FABRICATED NUMBERS
// =============================================================================

/**
 * Social proof statements that CAN be shipped today.
 * These contain NO fabricated review counts or ratings.
 *
 * Usage: Import in landing page components for trust signals.
 * These replace all instances of "4.8★ · 500+ businesses" and
 * "Trusted by 500+ businesses" which are unverifiable.
 */
export const VERIFIABLE_METRICS = {
  trustSignal: "Trusted by businesses across India",
  platformDescription: "WhatsApp-powered e-commerce platform",
  pricing: "Free plan available — no credit card required",
} as const;

// =============================================================================
// CORPORATE ENTITY DATA
// =============================================================================

/** Real founding date. Update with actual date if different. */
export const FOUNDING_DATE = "2024-01-01";

/**
 * Founder name for E-E-A-T signals in schema.
 *
 * IMPORTANT: Replace "The Flowauxi Team" with the real founder's name
 * before shipping. Google uses founder information for entity disambiguation.
 * A real, verifiable person name strengthens E-E-A-T signals.
 *
 * If the founder prefers privacy, use a role description:
 *   "Flowauxi Engineering Team" is acceptable but less strong than a real name.
 */
export const FOUNDER_NAME = "The Flowauxi Team"; // TODO: Replace with real founder name

// =============================================================================
// WIKIDATA ENTITY IDS — KNOWLEDGE GRAPH INTEGRATION
// =============================================================================

/**
 * Wikidata Q-item IDs for entity mapping.
 *
 * These connect Flowauxi to Google's Knowledge Graph by linking
 * our structured data to established Wikidata entities.
 *
 * The `flowauxi` entry is a placeholder. After registering Flowauxi
 * on Wikidata (external task 0K), replace "Q_TODO" with the actual Q-item.
 *
 * Steps to register:
 *   1. Go to https://www.wikidata.org/wiki/Special:NewItem
 *   2. Create item: label "Flowauxi", description "WhatsApp-powered e-commerce platform"
 *   3. Add statements: instance of (P31) = software company (Q4830453),
 *      headquarters (P159) = Tirunelveli, India, website (P856) = flowauxi.com
 *   4. Replace Q_TODO below with the new Q-item
 */
export const WIKIDATA_IDS = {
  flowauxi: "Q_TODO", // Replace after Wikidata registration
  whatsapp: "Q5526630",
  ecommerce: "Q186149",
  softwareCompany: "Q4830453",
  saasPlatform: "Q107748040",
  india: "Q668",
} as const;

// =============================================================================
// ORGANIZATION sameAs — IDENTITY ACROSS THE WEB
// =============================================================================

/**
 * Expanded sameAs array for Organization schema.
 *
 * CRITICAL: Every URL in this array MUST resolve to an active, indexed profile.
 * Google's Quality Rater Guidelines require sameAs links to be verifiable.
 *
 * BEFORE SHIPPING:
 *   - Verify each URL resolves (click every link)
 *   - Verify each profile has consistent NAP (Name, Address, Phone)
 *   - Verify each profile describes Flowauxi as "WhatsApp-powered e-commerce platform"
 *     or similar — the description must be consistent across all profiles
 *
 * Adding a URL that 404s or points to an empty profile HURTS entity signals.
 * When in doubt, comment it out until the profile is properly set up.
 */
export const ORGANIZATION_SAME_AS = [
  // Social profiles (VERIFY: each must be active and indexed)
  "https://www.linkedin.com/company/flowauxi",
  "https://twitter.com/flowauxi",
  "https://www.facebook.com/flowauxi",
  "https://www.youtube.com/@flowauxi",
  "https://github.com/flowauxi",

  // Directory profiles (VERIFY: each must be claimed with real data)
  "https://www.crunchbase.com/organization/flowauxi",
  "https://www.producthunt.com/products/flowauxi",
  "https://www.trustpilot.com/review/flowauxi.com",

  // Review platforms — UNCOMMENT after claiming profiles
  // "https://www.g2.com/products/flowauxi",
  // "https://www.capterra.com/p/flowauxi",

  // Wikidata entity — UNCOMMENT after Wikidata item is created (task 0K)
  // `https://www.wikidata.org/wiki/${WIKIDATA_IDS.flowauxi}`,
] as const;

// =============================================================================
// KNOWS ABOUT — TOPICAL ENTITY MAPPING
// =============================================================================

/**
 * Entity mappings for Organization.knowsAbout.
 *
 * Each entry maps a Flowauxi expertise area to a Wikidata or Wikipedia entity.
 * This tells Google's Knowledge Graph what topics Flowauxi is authoritative for.
 *
 * The url field can be a Wikidata URI or Wikipedia article. Wikidata is preferred
 * because it's machine-readable and directly used by Google's Knowledge Graph.
 */
export const KNOWS_ABOUT_ENTITIES = [
  {
    name: "WhatsApp Business API",
    wikidataId: WIKIDATA_IDS.whatsapp,
    url: "https://www.wikidata.org/wiki/Q5526630",
  },
  {
    name: "E-commerce",
    wikidataId: WIKIDATA_IDS.ecommerce,
    url: "https://www.wikidata.org/wiki/Q186149",
  },
  {
    name: "Online store builder",
    wikidataId: WIKIDATA_IDS.softwareCompany,
    url: "https://www.wikidata.org/wiki/Q4830453",
  },
  {
    name: "Conversational commerce",
    wikidataId: WIKIDATA_IDS.saasPlatform,
    url: "https://www.wikidata.org/wiki/Q107748040",
  },
  {
    name: "AI Chatbot",
    url: "https://en.wikipedia.org/wiki/Chatbot",
  },
  {
    name: "Customer Relationship Management",
    url: "https://en.wikipedia.org/wiki/Customer_relationship_management",
  },
  {
    name: "Marketing Automation",
    url: "https://en.wikipedia.org/wiki/Marketing_automation",
  },
  {
    name: "OTP Verification",
    url: "https://en.wikipedia.org/wiki/One-time_password",
  },
] as const;