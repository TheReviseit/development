/**
 * Entity Graph for Topical Authority - FAANG Level SEO
 * =======================================================
 *
 * This module defines Flowauxi's semantic entity graph for Google Knowledge Graph
 * integration and topical authority establishment.
 *
 * FAANG Principle: Google ranks sites that OWN a topic, not just individual pages.
 * This entity graph maps all concepts Flowauxi should be authoritative for.
 *
 * @see https://developers.google.com/search/docs/advanced/structured-data/intro-structured-data
 */

// =============================================================================
// ENTITY TYPES
// =============================================================================

export interface Entity {
  id: string;
  name: string;
  type: "primary" | "secondary" | "tertiary";
  aliases: string[];
  description: string;
  relatedEntities: string[];
  wikipediaUrl?: string;
  wikidataId?: string;
  schemaType: string;
}

export interface TopicCluster {
  id: string;
  name: string;
  pillarKeyword: string;
  pillarUrl: string;
  pillarTitle: string;
  pillarWordCount: [min: number, max: number];
  clusterKeywords: ClusterKeyword[];
  clusterUrls: string[];
  entities: {
    primary: Entity[];
    secondary: Entity[];
    tertiary: Entity[];
  };
  semanticRelations: SemanticRelation[];
  internalLinkDensity: number;
  launchedAt?: Date;
}

export interface ClusterKeyword {
  keyword: string;
  volume: number;
  difficulty: number;
  intent: SearchIntent;
  contentFormat: ContentFormat;
  url?: string;
}

export interface SemanticRelation {
  from: string;
  to: string;
  relation: "is_a" | "has_a" | "related_to" | "part_of" | "used_for" | "compared_to";
  strength: number;
}

export type SearchIntent = "informational" | "commercial" | "transactional" | "navigational";

export type ContentFormat =
  | "pillar_guide"
  | "how_to_guide"
  | "comparison_table"
  | "feature_showcase"
  | "pricing_page"
  | "landing_page"
  | "blog_article"
  | "case_study"
  | "integration_guide"
  | "city_page"
  | "industry_page";

// =============================================================================
// FLOWAUXI ENTITY GRAPH
// =============================================================================

export const PRIMARY_ENTITIES: Entity[] = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    type: "primary",
    aliases: [
      "WhatsApp Messenger",
      "WhatsApp Business",
      "WhatsApp Business API",
      "WhatsApp Commerce",
    ],
    description: "WhatsApp is a cross-platform messaging and Voice over IP service owned by Meta.",
    relatedEntities: ["meta", "messaging", "e-commerce", "chatbot", "automation"],
    wikipediaUrl: "https://en.wikipedia.org/wiki/WhatsApp",
    wikidataId: "Q746483",
    schemaType: "SoftwareApplication",
  },
  {
    id: "ecommerce",
    name: "E-commerce",
    type: "primary",
    aliases: [
      "Online Store",
      "E-commerce Platform",
      "Online Shop",
      "Digital Commerce",
      "Internet Retail",
    ],
    description: "E-commerce is the buying and selling of goods and services over the internet.",
    relatedEntities: ["shopping", "payments", "logistics", "whatsapp", "d2c"],
    schemaType: "Thing",
  },
  {
    id: "flowauxi",
    name: "Flowauxi",
    type: "primary",
    aliases: [
      "Flowauxi Shop",
      "Flowauxi AI",
      "Flowauxi WhatsApp Store",
      "Flowauxi Chatbot",
    ],
    description: "Flowauxi is a free WhatsApp-powered e-commerce platform with AI chatbot, order automation, and payment integration for businesses in India.",
    relatedEntities: ["whatsapp", "chatbot", "ecommerce", "automation", "payments"],
    schemaType: "SoftwareApplication",
  },
  {
    id: "conversational_commerce",
    name: "Conversational Commerce",
    type: "primary",
    aliases: [
      "Chat Commerce",
      "Messaging Commerce",
      "WhatsApp Commerce",
      "Chat-based Shopping",
    ],
    description: "Conversational commerce is the intersection of messaging apps and shopping, enabling customers to interact with businesses and make purchases through chat.",
    relatedEntities: ["whatsapp", "chatbot", "ecommerce", "messaging"],
    schemaType: "Thing",
  },
];

export const SECONDARY_ENTITIES: Entity[] = [
  {
    id: "chatbot",
    name: "Chatbot",
    type: "secondary",
    aliases: [
      "AI Chatbot",
      "Conversational AI",
      "Automated Chat",
      "Bot",
      "Chat Assistant",
    ],
    description: "A chatbot is a software application used to conduct an on-line chat conversation via text or text-to-speech, in lieu of providing direct contact with a live human agent.",
    relatedEntities: ["ai", "customer-service", "automation", "whatsapp"],
    schemaType: "SoftwareApplication",
  },
  {
    id: "order_automation",
    name: "Order Automation",
    type: "secondary",
    aliases: [
      "Automated Orders",
      "Order Processing",
      "Order Management",
      "Order Workflows",
    ],
    description: "Order automation refers to systems that automatically process customer orders from placement to fulfillment without manual intervention.",
    relatedEntities: ["ecommerce", "whatsapp", "automation", "payments"],
    schemaType: "Thing",
  },
  {
    id: "invoice_automation",
    name: "Invoice Automation",
    type: "secondary",
    aliases: [
      "Automated Invoicing",
      "Invoice Generation",
      "PDF Invoice",
      "E-invoicing",
    ],
    description: "Invoice automation is the process of automatically generating and sending invoices to customers after an order is placed.",
    relatedEntities: ["order_automation", "payments", "whatsapp"],
    schemaType: "Thing",
  },
  {
    id: "payment_integration",
    name: "Payment Integration",
    type: "secondary",
    aliases: [
      "Payment Gateway",
      "UPI Integration",
      "Razorpay Integration",
      "Stripe Integration",
      "Online Payments",
    ],
    description: "Payment integration connects an e-commerce platform with payment gateways to process transactions securely.",
    relatedEntities: ["razorpay", "stripe", "upi", "payments"],
    schemaType: "Thing",
  },
  {
    id: "crm",
    name: "CRM Integration",
    type: "secondary",
    aliases: [
      "Customer Relationship Management",
      "WhatsApp CRM",
      "Contact Management",
      "Customer Database",
    ],
    description: "CRM integration enables customer data from WhatsApp conversations to be automatically captured and organized in a customer database.",
    relatedEntities: ["whatsapp", "customer-data", "automation"],
    schemaType: "Thing",
  },
];

export const TERTIARY_ENTITIES: Entity[] = [
  {
    id: "d2c",
    name: "D2C",
    type: "tertiary",
    aliases: [
      "Direct-to-Consumer",
      "DTC",
      "Direct to Consumer Brand",
      "D2C Brand",
    ],
    description: "D2C means selling products directly to consumers, bypassing third-party retailers or wholesalers.",
    relatedEntities: ["ecommerce", "brand", "retail"],
    schemaType: "Thing",
  },
  {
    id: "india_smb",
    name: "India SMB",
    type: "tertiary",
    aliases: [
      "Indian Small Business",
      "MSME India",
      "SMB India",
      "Small and Medium Business",
      "Indian Entrepreneur",
    ],
    description: "India's small and medium businesses represent over 63 million enterprises contributing significantly to the country's GDP.",
    relatedEntities: ["india", "small-business", "entrepreneurship", "ecommerce"],
    schemaType: "Thing",
  },
  {
    id: "mumbai",
    name: "Mumbai",
    type: "tertiary",
    aliases: ["Bombay", "Mumbai City", "Financial Capital of India"],
    description: "Mumbai is the financial capital of India and home to millions of small businesses and entrepreneurs.",
    relatedEntities: ["india", "ecommerce", "d2c"],
    schemaType: "City",
  },
];

// =============================================================================
// TOPIC CLUSTERS
// =============================================================================

export const TOPIC_CLUSTERS: TopicCluster[] = [
  {
    id: "whatsapp_commerce_platform",
    name: "WhatsApp Commerce Platform",
    pillarKeyword: "WhatsApp Commerce Platform",
    pillarUrl: "/features/whatsapp-store",
    pillarTitle: "WhatsApp-Powered Online Store with Automated Order Booking",
    pillarWordCount: [4000, 6000],
    clusterKeywords: [
      {
        keyword: "what is whatsapp e-commerce",
        volume: 6500,
        difficulty: 35,
        intent: "informational",
        contentFormat: "blog_article",
      },
      {
        keyword: "how to sell on whatsapp",
        volume: 4800,
        difficulty: 30,
        intent: "informational",
        contentFormat: "how_to_guide",
      },
      {
        keyword: "whatsapp order automation",
        volume: 880,
        difficulty: 20,
        intent: "commercial",
        contentFormat: "feature_showcase",
      },
      {
        keyword: "whatsapp product catalog",
        volume: 1200,
        difficulty: 25,
        intent: "commercial",
        contentFormat: "feature_showcase",
      },
      {
        keyword: "whatsapp business api for e-commerce",
        volume: 2200,
        difficulty: 40,
        intent: "informational",
        contentFormat: "blog_article",
      },
      {
        keyword: "sell on whatsapp without website",
        volume: 1600,
        difficulty: 25,
        intent: "informational",
        contentFormat: "how_to_guide",
      },
      {
        keyword: "whatsapp crm for e-commerce",
        volume: 890,
        difficulty: 30,
        intent: "commercial",
        contentFormat: "blog_article",
      },
    ],
    clusterUrls: [
      "/blog/what-is-whatsapp-ecommerce",
      "/blog/how-to-sell-on-whatsapp",
      "/blog/whatsapp-order-automation",
      "/blog/whatsapp-product-catalog",
      "/blog/whatsapp-business-api-guide",
      "/blog/sell-on-whatsapp-without-website",
      "/blog/whatsapp-crm-for-ecommerce",
    ],
    entities: {
      primary: PRIMARY_ENTITIES.filter((e) => ["whatsapp", "ecommerce", "flowauxi"].includes(e.id)),
      secondary: SECONDARY_ENTITIES.filter((e) => ["chatbot", "crm"].includes(e.id)),
      tertiary: TERTIARY_ENTITIES,
    },
    semanticRelations: [
      { from: "whatsapp", to: "ecommerce", relation: "used_for", strength: 0.95 },
      { from: "flowauxi", to: "whatsapp", relation: "is_a", strength: 0.9 },
      { from: "flowauxi", to: "ecommerce", relation: "is_a", strength: 0.85 },
      { from: "chatbot", to: "whatsapp", relation: "part_of", strength: 0.8 },
      { from: "crm", to: "ecommerce", relation: "used_for", strength: 0.75 },
    ],
    internalLinkDensity: 10,
  },
  {
    id: "ai_chatbot_business",
    name: "AI Chatbot for Business",
    pillarKeyword: "AI Chatbot for WhatsApp",
    pillarUrl: "/features/ai-chatbot",
    pillarTitle: "AI-Powered WhatsApp Chatbot for E-commerce",
    pillarWordCount: [3500, 5000],
    clusterKeywords: [
      {
        keyword: "how whatsapp chatbot works",
        volume: 2400,
        difficulty: 25,
        intent: "informational",
        contentFormat: "how_to_guide",
      },
      {
        keyword: "best whatsapp chatbot for e-commerce",
        volume: 1200,
        difficulty: 35,
        intent: "commercial",
        contentFormat: "comparison_table",
      },
      {
        keyword: "training ai chatbot on business data",
        volume: 580,
        difficulty: 30,
        intent: "informational",
        contentFormat: "blog_article",
      },
      {
        keyword: "whatsapp chatbot pricing",
        volume: 880,
        difficulty: 35,
        intent: "commercial",
        contentFormat: "pricing_page",
      },
      {
        keyword: "chatbot vs live agent",
        volume: 1800,
        difficulty: 25,
        intent: "informational",
        contentFormat: "comparison_table",
      },
      {
        keyword: "ai chatbot return on investment",
        volume: 720,
        difficulty: 30,
        intent: "informational",
        contentFormat: "blog_article",
      },
    ],
    clusterUrls: [
      "/blog/how-whatsapp-chatbot-works",
      "/blog/best-whatsapp-chatbot-ecommerce",
      "/blog/training-ai-chatbot-business",
      "/blog/whatsapp-chatbot-pricing",
      "/blog/chatbot-vs-live-agent",
      "/blog/ai-chatbot-roi",
    ],
    entities: {
      primary: PRIMARY_ENTITIES.filter((e) => ["whatsapp", "flowauxi"].includes(e.id)),
      secondary: SECONDARY_ENTITIES.filter((e) => ["chatbot"].includes(e.id)),
      tertiary: TERTIARY_ENTITIES,
    },
    semanticRelations: [
      { from: "chatbot", to: "whatsapp", relation: "part_of", strength: 0.9 },
      { from: "chatbot", to: "ecommerce", relation: "used_for", strength: 0.85 },
      { from: "flowauxi", to: "chatbot", relation: "has_a", strength: 0.95 },
    ],
    internalLinkDensity: 10,
  },
  {
    id: "order_automation",
    name: "Order Automation",
    pillarKeyword: "WhatsApp Order Automation",
    pillarUrl: "/features/order-automation",
    pillarTitle: "Automated Order Booking via WhatsApp",
    pillarWordCount: [3000, 4500],
    clusterKeywords: [
      {
        keyword: "whatsapp order tracking",
        volume: 1400,
        difficulty: 20,
        intent: "commercial",
        contentFormat: "feature_showcase",
      },
      {
        keyword: "automated order processing",
        volume: 2200,
        difficulty: 35,
        intent: "informational",
        contentFormat: "blog_article",
      },
      {
        keyword: "order confirmation whatsapp",
        volume: 890,
        difficulty: 20,
        intent: "commercial",
        contentFormat: "feature_showcase",
      },
      {
        keyword: "delivery status updates whatsapp",
        volume: 720,
        difficulty: 25,
        intent: "informational",
        contentFormat: "blog_article",
      },
    ],
    clusterUrls: [
      "/blog/whatsapp-order-tracking",
      "/blog/automated-order-processing",
      "/blog/order-confirmation-whatsapp",
      "/blog/delivery-status-updates",
    ],
    entities: {
      primary: PRIMARY_ENTITIES.filter((e) => ["whatsapp", "ecommerce"].includes(e.id)),
      secondary: SECONDARY_ENTITIES.filter((e) => ["order_automation"].includes(e.id)),
      tertiary: TERTIARY_ENTITIES,
    },
    semanticRelations: [
      { from: "order_automation", to: "whatsapp", relation: "used_for", strength: 0.9 },
      { from: "order_automation", to: "ecommerce", relation: "part_of", strength: 0.85 },
    ],
    internalLinkDensity: 8,
  },
  {
    id: "invoice_automation",
    name: "Invoice & Payment Automation",
    pillarKeyword: "WhatsApp Invoice Automation",
    pillarUrl: "/features/invoice-automation",
    pillarTitle: "Automated PDF Invoice Delivery via WhatsApp",
    pillarWordCount: [2500, 4000],
    clusterKeywords: [
      {
        keyword: "automated invoice generation",
        volume: 1800,
        difficulty: 30,
        intent: "informational",
        contentFormat: "blog_article",
      },
      {
        keyword: "send invoice via whatsapp",
        volume: 4500,
        difficulty: 25,
        intent: "informational",
        contentFormat: "how_to_guide",
      },
      {
        keyword: "whatsapp payment integration",
        volume: 3600,
        difficulty: 35,
        intent: "commercial",
        contentFormat: "integration_guide",
      },
      {
        keyword: "razorpay whatsapp integration",
        volume: 1200,
        difficulty: 20,
        intent: "commercial",
        contentFormat: "integration_guide",
      },
    ],
    clusterUrls: [
      "/blog/automated-invoice-generation",
      "/blog/send-invoice-whatsapp",
      "/blog/whatsapp-payment-integration",
      "/integrations/razorpay",
    ],
    entities: {
      primary: PRIMARY_ENTITIES.filter((e) => ["whatsapp", "ecommerce"].includes(e.id)),
      secondary: SECONDARY_ENTITIES.filter((e) => ["invoice_automation", "payment_integration"].includes(e.id)),
      tertiary: TERTIARY_ENTITIES,
    },
    semanticRelations: [
      { from: "invoice_automation", to: "whatsapp", relation: "used_for", strength: 0.9 },
      { from: "payment_integration", to: "ecommerce", relation: "part_of", strength: 0.85 },
    ],
    internalLinkDensity: 8,
  },
  {
    id: "comparisons",
    name: "Competitor Comparisons",
    pillarKeyword: "Flowauxi Alternatives",
    pillarUrl: "/compare",
    pillarTitle: "Compare Flowauxi with WhatsApp Commerce Platforms",
    pillarWordCount: [2000, 3000],
    clusterKeywords: [
      {
        keyword: "flowauxi vs shopify",
        volume: 480,
        difficulty: 20,
        intent: "commercial",
        contentFormat: "comparison_table",
      },
      {
        keyword: "flowauxi vs dukaan",
        volume: 210,
        difficulty: 15,
        intent: "commercial",
        contentFormat: "comparison_table",
      },
      {
        keyword: "flowauxi vs wati",
        volume: 170,
        difficulty: 15,
        intent: "commercial",
        contentFormat: "comparison_table",
      },
      {
        keyword: "flowauxi vs woocommerce",
        volume: 320,
        difficulty: 25,
        intent: "commercial",
        contentFormat: "comparison_table",
      },
      {
        keyword: "shopify alternatives for whatsapp",
        volume: 120,
        difficulty: 25,
        intent: "commercial",
        contentFormat: "comparison_table",
      },
    ],
    clusterUrls: [
      "/compare/shopify",
      "/compare/dukaan",
      "/compare/wati",
      "/compare/woocommerce",
    ],
    entities: {
      primary: PRIMARY_ENTITIES.filter((e) => ["flowauxi", "ecommerce"].includes(e.id)),
      secondary: [],
      tertiary: TERTIARY_ENTITIES,
    },
    semanticRelations: [
      { from: "flowauxi", to: "shopify", relation: "compared_to", strength: 0.8 },
      { from: "flowauxi", to: "dukaan", relation: "compared_to", strength: 0.85 },
    ],
    internalLinkDensity: 12,
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all entities for a topic cluster
 */
export function getClusterEntities(clusterId: string): {
  primary: Entity[];
  secondary: Entity[];
  tertiary: Entity[];
} {
  const cluster = TOPIC_CLUSTERS.find((c) => c.id === clusterId);
  return cluster?.entities || { primary: [], secondary: [], tertiary: [] };
}

/**
 * Get all semantic relations for Schema.org structured data
 */
export function getSemanticRelations(clusterId: string): SemanticRelation[] {
  const cluster = TOPIC_CLUSTERS.find((c) => c.id === clusterId);
  return cluster?.semanticRelations || [];
}

/**
 * Get cluster by URL
 */
export function getClusterByUrl(url: string): TopicCluster | undefined {
  return TOPIC_CLUSTERS.find((c) => c.pillarUrl === url || c.clusterUrls.includes(url));
}

/**
 * Get all entities for Knowledge Graph
 */
export function getKnowledgeGraphEntities(): Entity[] {
  return [...PRIMARY_ENTITIES, ...SECONDARY_ENTITIES, ...TERTIARY_ENTITIES];
}

/**
 * Generate Schema.org structured data for entity relations
 */
export function generateEntitySchema(): Record<string, unknown> {
  const entities = getKnowledgeGraphEntities();

  return {
    "@context": "https://schema.org",
    "@graph": entities.map((entity) => ({
      "@type": entity.schemaType,
      "@id": `https://www.flowauxi.com/entity/${entity.id}`,
      name: entity.name,
      alternateName: entity.aliases,
      description: entity.description,
      sameAs: entity.wikipediaUrl,
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `https://www.flowauxi.com/entity/${entity.id}`,
      },
    })),
  };
}

/**
 * Get internal link suggestions for a page
 */
export function getInternalLinkSuggestions(url: string): string[] {
  const cluster = getClusterByUrl(url);
  if (!cluster) return [];

  // Get all cluster URLs + pillar URL
  const allUrls = [cluster.pillarUrl, ...cluster.clusterUrls];

  // Get related cluster URLs
  const relatedClusters = TOPIC_CLUSTERS.filter(
    (c) => c.id !== cluster.id && c.entities.primary.some((e) => cluster.entities.primary.includes(e))
  );

  const relatedUrls = relatedClusters.flatMap((c) => [c.pillarUrl, ...c.clusterUrls.slice(0, 3)]);

  return [...allUrls, ...relatedUrls].slice(0, 15);
}