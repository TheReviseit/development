/**
 * SEO Module Index - FAANG Level SEO Infrastructure
 * ================================================
 *
 * This module exports all SEO-related utilities for Flowauxi.
 *
 * Usage:
 *   import { TOPIC_CLUSTERS, INTENT_MATRIX, getKeywordOpportunities } from "@/lib/seo";
 */

// =============================================================================
// ENTITY GRAPH & TOPICAL AUTHORITY
// =============================================================================

export {
  // Types
  type Entity,
  type TopicCluster,
  type ClusterKeyword,
  type SemanticRelation,
  type SearchIntent,
  type ContentFormat,
  
  // Data
  PRIMARY_ENTITIES,
  SECONDARY_ENTITIES,
  TERTIARY_ENTITIES,
  TOPIC_CLUSTERS,
  
  // Functions
  getClusterEntities,
  getSemanticRelations,
  getClusterByUrl,
  getKnowledgeGraphEntities,
  generateEntitySchema,
  getInternalLinkSuggestions,
} from "./entity-graph";

// =============================================================================
// INTENT MATRIX
// =============================================================================

export {
  // Types
  type KeywordIntentMapping,
  
  // Data
  INTENT_MATRIX,
  
  // Functions
  getKeywordsByIntent,
  getKeywordsByPriority,
  getKeywordsByFormat,
  getKeywordOpportunities,
  getKeywordByTemplate,
  getContentRequirements,
  calculateKeywordScore,
  getRecommendedCluster,
  getCTAConfiguration,
  getIntentMatrix,
} from "./intent-matrix";

// =============================================================================
// COMPETITOR ANALYSIS
// =============================================================================

export {
  // Types
  type CompetitorData,
  type CompetitorKeyword,
  type KeywordGap,
  type ContentGap,
  
  // Data
  COMPETITORS,
  BLUE_OCEAN_KEYWORDS,
  COMPETITIVE_KEYWORDS,
  CONTENT_GAPS,
  
  // Functions
  getSortedContentGaps,
  getBlueOceanKeywords,
  getCompetitiveKeywords,
  calculateOpportunityScore,
  getRecommendedContent,
  getCompetitorPositioning,
  generateComparisonData,
} from "./competitor-analysis";

// =============================================================================
// PROGRAMMATIC SEO
// =============================================================================

export {
  // Types
  type ProgrammaticPageConfig,
  type CityData,
  type IndustryData,
  type IntegrationData,
  type CityTestimonial,
  type IndustryTestimonial,
  type IntegrationTestimonial,
  
  // Data
  QUALITY_THRESHOLDS,
  INDIA_CITIES,
  INDUSTRIES,
  INTEGRATIONS,
  
  // Functions
  getCitiesForGeneration,
  getIndustriesForGeneration,
  getIntegrationsForGeneration,
  calculatePageQuality,
  shouldPageIndex,
  generateCityUniqueContent,
  generateIndustryUniqueContent,
  generateCityMetaDescription,
  generateIndustryMetaDescription,
} from "./programmatic";

// =============================================================================
// CTR OPTIMIZATION
// =============================================================================

export {
  // Types
  type TitleTagVariant,
  type MetaDescriptionVariant,
  type RichSnippetConfig,
  type CTAConfig,
  
  // Data
  TITLE_TAG_FRAMEWORKS,
  EMOTIONAL_TRIGGERS,
  META_DESCRIPTION_FRAMEWORKS,
  RICH_SNIPPETS_CONFIG,
  CTA_BY_INTENT,
  
  // Functions
  generateTitleVariants,
  generateDescriptionVariants,
  getCTAConfig,
  calculateCTRImprovement,
  getRichSnippetRequirements,
  generateFaqSchemaForPAA,
  validateFaqSchema,
} from "./ctr-optimization";

// =============================================================================
// SCHEMA EXTENSIONS
// =============================================================================

export {
  type HowToStep,
  generateHowToSchema,
  generateLocalBusinessSchema,
  generateReviewSchema,
  generatePricingSchema,
  generatePricingRangeSchema,
} from "./schema-extensions";

// =============================================================================
// BLOG SCHEMA
// =============================================================================

export { generateBlogSchema } from "./blog-schema";

// =============================================================================
// ENTITY DEFINITION — SINGLE SOURCE OF TRUTH
// =============================================================================

export {
  ENABLE_REVIEWS,
  getReviewRating,
  ORGANIZATION_SAME_AS,
  WIKIDATA_IDS,
  KNOWS_ABOUT_ENTITIES,
  FOUNDING_DATE,
  FOUNDER_NAME,
  VERIFIABLE_METRICS,
} from "./entity-definition";

// =============================================================================
// INDEXNOW PROTOCOL
// =============================================================================

export {
  submitToIndexNow,
  notifySearchEngines,
  batchNotifySearchEngines,
} from "./indexnow";

// =============================================================================
// EXISTING SEO MODULES
// =============================================================================

export * from "./structured-data";
export * from "./store-metadata";
export * from "./product-schema";
export * from "./domain-seo";