/**
 * Programmatic SEO Foundation - FAANG Level
 * ==========================================
 *
 * This module provides the foundation for generating unique, valuable
 * programmatic SEO pages that pass Google's Helpful Content evaluation.
 *
 * FAANG Principle: Each programmatic page MUST have unique data that
 * provides genuine value. Template-only pages will be deindexed.
 *
 * @see https://developers.google.com/search/docs/fundamentals/creating-helpful-content
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ProgrammaticPageConfig {
  type: "city" | "industry" | "integration";
  template: string;
  dynamicData: string[]; // Data points that make each page unique
  minDataPoints: number; // Minimum data points to generate page
  minUniqueWords: number; // Minimum unique content (not templated)
  noindexThreshold: boolean; // NOINDEX if below threshold
}

export interface CityData {
  name: string;
  slug: string;
  state: string;
  tier: "tier-1" | "tier-2" | "tier-3";
  population: number;
  region: string;
  // Unique data points (from platform database)
  merchantCount?: number;
  orderVolume?: number;
  topCategories?: string[];
  avgOrderValue?: number;
  testimonials?: CityTestimonial[];
  nearbyCities?: string[];
  paymentMethods?: string[];
  courierPartners?: string[];
  // Quality scoring
  dataQualityScore?: number;
}

export interface IndustryData {
  name: string;
  slug: string;
  categories: string[];
  useCases: string[];
  // Unique data points
  merchantCount?: number;
  avgRevenue?: number;
  topProducts?: string[];
  avgOrderValue?: number;
  testimonials?: IndustryTestimonial[];
  popularIntegrations?: string[];
  growthRate?: number;
  // Quality scoring
  dataQualityScore?: number;
}

export interface IntegrationData {
  name: string;
  slug: string;
  provider: string;
  type: "payment" | "shipping" | "analytics" | "crm" | "other";
  logo?: string;
  features: string[];
  // Unique data points
  usersConnected?: number;
  transactionVolume?: number;
  setupTime?: string;
  documentation?: string;
  testimonials?: IntegrationTestimonial[];
  // Quality scoring
  dataQualityScore?: number;
}

export interface CityTestimonial {
  merchantName: string;
  businessName: string;
  quote: string;
  city: string;
  category?: string;
  revenue?: string;
}

export interface IndustryTestimonial {
  merchantName: string;
  businessName: string;
  quote: string;
  industry: string;
  category?: string;
}

export interface IntegrationTestimonial {
  merchantName: string;
  businessName: string;
  quote: string;
  integration: string;
}

// =============================================================================
// QUALITY THRESHOLDS
// =============================================================================

export const QUALITY_THRESHOLDS: Record<string, ProgrammaticPageConfig> = {
  city_page: {
    type: "city",
    template: "/whatsapp-store/[city]",
    dynamicData: [
      "merchantCount",
      "orderVolume",
      "topCategories",
      "avgOrderValue",
      "testimonials",
      "nearbyCities",
      "paymentMethods",
      "courierPartners",
    ],
    minDataPoints: 5,
    minUniqueWords: 400,
    noindexThreshold: true,
  },
  industry_page: {
    type: "industry",
    template: "/ecommerce/[industry]",
    dynamicData: [
      "merchantCount",
      "avgRevenue",
      "topProducts",
      "avgOrderValue",
      "testimonials",
      "popularIntegrations",
      "growthRate",
    ],
    minDataPoints: 6,
    minUniqueWords: 500,
    noindexThreshold: true,
  },
  integration_page: {
    type: "integration",
    template: "/integrations/[provider]",
    dynamicData: [
      "usersConnected",
      "transactionVolume",
      "setupTime",
      "testimonials",
      "features",
    ],
    minDataPoints: 4,
    minUniqueWords: 300,
    noindexThreshold: true,
  },
};

// =============================================================================
// CITY DATA - INDIA
// =============================================================================

export const INDIA_CITIES: CityData[] = [
  // Tier 1 - Highest Priority (Generate with full unique data)
  {
    name: "Mumbai",
    slug: "mumbai",
    state: "Maharashtra",
    tier: "tier-1",
    population: 20411000,
    region: "Western India",
    dataQualityScore: 95,
  },
  {
    name: "Delhi",
    slug: "delhi",
    state: "Delhi",
    tier: "tier-1",
    population: 16787941,
    region: "Northern India",
    dataQualityScore: 95,
  },
  {
    name: "Bangalore",
    slug: "bangalore",
    state: "Karnataka",
    tier: "tier-1",
    population: 8443675,
    region: "Southern India",
    dataQualityScore: 95,
  },
  {
    name: "Chennai",
    slug: "chennai",
    state: "Tamil Nadu",
    tier: "tier-1",
    population: 7168029,
    region: "Southern India",
    dataQualityScore: 90,
  },
  {
    name: "Hyderabad",
    slug: "hyderabad",
    state: "Telangana",
    tier: "tier-1",
    population: 6814484,
    region: "Southern India",
    dataQualityScore: 90,
  },
  {
    name: "Pune",
    slug: "pune",
    state: "Maharashtra",
    tier: "tier-1",
    population: 3124458,
    region: "Western India",
    dataQualityScore: 88,
  },
  {
    name: "Ahmedabad",
    slug: "ahmedabad",
    state: "Gujarat",
    tier: "tier-1",
    population: 5577940,
    region: "Western India",
    dataQualityScore: 85,
  },
  {
    name: "Kolkata",
    slug: "kolkata",
    state: "West Bengal",
    tier: "tier-1",
    population: 14035959,
    region: "Eastern India",
    dataQualityScore: 85,
  },
  // Tier 2 - Medium Priority
  {
    name: "Jaipur",
    slug: "jaipur",
    state: "Rajasthan",
    tier: "tier-2",
    population: 3073350,
    region: "Northern India",
    dataQualityScore: 75,
  },
  {
    name: "Surat",
    slug: "surat",
    state: "Gujarat",
    tier: "tier-2",
    population: 4467797,
    region: "Western India",
    dataQualityScore: 75,
  },
  {
    name: "Lucknow",
    slug: "lucknow",
    state: "Uttar Pradesh",
    tier: "tier-2",
    population: 2817105,
    region: "Northern India",
    dataQualityScore: 70,
  },
  {
    name: "Kanpur",
    slug: "kanpur",
    state: "Uttar Pradesh",
    tier: "tier-2",
    population: 2768342,
    region: "Northern India",
    dataQualityScore: 65,
  },
  {
    name: "Nagpur",
    slug: "nagpur",
    state: "Maharashtra",
    tier: "tier-2",
    population: 2405665,
    region: "Western India",
    dataQualityScore: 70,
  },
  {
    name: "Indore",
    slug: "indore",
    state: "Madhya Pradesh",
    tier: "tier-2",
    population: 1964089,
    region: "Central India",
    dataQualityScore: 65,
  },
  {
    name: "Coimbatore",
    slug: "coimbatore",
    state: "Tamil Nadu",
    tier: "tier-2",
    population: 1601438,
    region: "Southern India",
    dataQualityScore: 70,
  },
  {
    name: "Vadodara",
    slug: "vadodara",
    state: "Gujarat",
    tier: "tier-2",
    population: 1799469,
    region: "Western India",
    dataQualityScore: 68,
  },
];

// =============================================================================
// INDUSTRY DATA
// =============================================================================

export const INDUSTRIES: IndustryData[] = [
  {
    name: "Fashion & Apparel",
    slug: "fashion-apparel",
    categories: ["Women's Wear", "Men's Wear", "Kids Wear", "Accessories", "Ethnic Wear"],
    useCases: [
      "Product catalog sharing via WhatsApp",
      "Size/color selection through chat",
      "Order tracking and notifications",
      "Customer support automation",
    ],
    dataQualityScore: 90,
  },
  {
    name: "Electronics & Gadgets",
    slug: "electronics-gadgets",
    categories: ["Mobiles", "Laptops", "Accessories", "Smart Home", "Gaming"],
    useCases: [
      "Technical specifications sharing",
      "Product comparison assistance",
      "Warranty tracking",
      "Order status updates",
    ],
    dataQualityScore: 85,
  },
  {
    name: "Home Decor",
    slug: "home-decor",
    categories: ["Furniture", "Lighting", "Decor", "Kitchen", "Bedding"],
    useCases: [
      "Visual catalog presentation",
      "Room mockups and suggestions",
      "Custom order handling",
      "Delivery tracking",
    ],
    dataQualityScore: 80,
  },
  {
    name: "Food & Beverage",
    slug: "food-beverage",
    categories: ["Restaurant", "Cafe", "Bakery", "Groceries", "Beverages"],
    useCases: [
      "Menu ordering via WhatsApp",
      "Real-time order updates",
      "Delivery tracking",
      "Customer feedback collection",
    ],
    dataQualityScore: 85,
  },
  {
    name: "Health & Beauty",
    slug: "health-beauty",
    categories: ["Skincare", "Haircare", "Makeup", "Wellness", "Personal Care"],
    useCases: [
      "Product recommendations",
      "Ingredient information",
      "Subscription management",
      "Order tracking",
    ],
    dataQualityScore: 82,
  },
  {
    name: "Jewelry & Accessories",
    slug: "jewelry-accessories",
    categories: ["Gold", "Silver", "Diamond", "Fashion Jewelry", "Watches"],
    useCases: [
      "High-value order handling",
      "Custom design requests",
      "Certificate sharing",
      "Secure payment integration",
    ],
    dataQualityScore: 78,
  },
  {
    name: "Books & Stationery",
    slug: "books-stationery",
    categories: ["Books", "Notebooks", "Pens", "Art Supplies", "Office Supplies"],
    useCases: [
      "Catalog browsing",
      "Recommendation engine",
      "Bulk order handling",
      "Subscription delivery",
    ],
    dataQualityScore: 72,
  },
  {
    name: "Sports & Fitness",
    slug: "sports-fitness",
    categories: ["Gym Equipment", "Sports Gear", "Activewear", "Supplements", "Accessories"],
    useCases: [
      "Product sizing assistance",
      "Equipment recommendations",
      "Subscription management",
      "Order tracking",
    ],
    dataQualityScore: 75,
  },
  {
    name: "Pet Supplies",
    slug: "pet-supplies",
    categories: ["Pet Food", "Toys", "Accessories", "Healthcare", "Grooming"],
    useCases: [
      "Recurring order management",
      "Product recommendations",
      "Subscription handling",
      "Customer support",
    ],
    dataQualityScore: 68,
  },
  {
    name: "Automotive",
    slug: "automotive",
    categories: ["Parts", "Accessories", "Tools", "Services", "Electronics"],
    useCases: [
      "Part compatibility check",
      "Service booking",
      "Order tracking",
      "Technical support",
    ],
    dataQualityScore: 70,
  },
];

// =============================================================================
// INTEGRATION DATA
// =============================================================================

export const INTEGRATIONS: IntegrationData[] = [
  {
    name: "Razorpay Integration",
    slug: "razorpay",
    provider: "Razorpay",
    type: "payment",
    features: [
      "UPI Payments",
      "Credit/Debit Cards",
      "Net Banking",
      "EMI Options",
      "International Payments",
      "Auto-capture",
    ],
    dataQualityScore: 95,
  },
  {
    name: "Paytm Integration",
    slug: "paytm",
    provider: "Paytm",
    type: "payment",
    features: [
      "UPI Payments",
      "Wallet",
      "Credit/Debit Cards",
      "Paytm Postpaid",
    ],
    dataQualityScore: 90,
  },
  {
    name: "PhonePe Integration",
    slug: "phonepe",
    provider: "PhonePe",
    type: "payment",
    features: [
      "UPI Payments",
      "Credit/Debit Cards",
      "QR Code Payments",
      "Instant Settlement",
    ],
    dataQualityScore: 88,
  },
  {
    name: "Google Pay Integration",
    slug: "google-pay",
    provider: "Google Pay",
    type: "payment",
    features: [
      "UPI Payments",
      "QR Code Payments",
      "Business Transactions",
    ],
    dataQualityScore: 85,
  },
  {
    name: "Google Sheets Sync",
    slug: "google-sheets",
    provider: "Google",
    type: "analytics",
    features: [
      "Order Sync",
      "Customer Database Export",
      "Inventory Tracking",
      "Revenue Reports",
    ],
    dataQualityScore: 92,
  },
  {
    name: "WhatsApp Business API",
    slug: "whatsapp-business-api",
    provider: "Meta",
    type: "other",
    features: [
      "Automated Messages",
      "Template Messages",
      "Chatbot Integration",
      "Broadcast Messages",
    ],
    dataQualityScore: 95,
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get cities that meet quality threshold
 */
export function getCitiesForGeneration(): CityData[] {
  return INDIA_CITIES.filter((city) => {
    const threshold = QUALITY_THRESHOLDS.city_page;
    return city.dataQualityScore && city.dataQualityScore >= threshold.minDataPoints * 10;
  });
}

/**
 * Get industries that meet quality threshold
 */
export function getIndustriesForGeneration(): IndustryData[] {
  return INDUSTRIES.filter((industry) => {
    const threshold = QUALITY_THRESHOLDS.industry_page;
    return industry.dataQualityScore && industry.dataQualityScore >= threshold.minDataPoints * 10;
  });
}

/**
 * Get integrations that meet quality threshold
 */
export function getIntegrationsForGeneration(): IntegrationData[] {
  return INTEGRATIONS.filter((integration) => {
    const threshold = QUALITY_THRESHOLDS.integration_page;
    return integration.dataQualityScore && integration.dataQualityScore >= threshold.minDataPoints * 10;
  });
}

/**
 * Calculate page quality score
 */
export function calculatePageQuality(
  pageType: "city" | "industry" | "integration",
  data: CityData | IndustryData | IntegrationData
): number {
  const threshold = QUALITY_THRESHOLDS[`${pageType}_page`];
  const dataPoints = threshold.dynamicData.filter((key) => key in data && data[key as keyof typeof data] != null);
  return Math.min(dataPoints.length / threshold.minDataPoints, 1) * 100;
}

/**
 * Determine if page should be indexed
 */
export function shouldPageIndex(
  pageType: "city" | "industry" | "integration",
  data: CityData | IndustryData | IntegrationData
): boolean {
  const qualityScore = calculatePageQuality(pageType, data);
  const threshold = QUALITY_THRESHOLDS[`${pageType}_page`];
  return qualityScore >= threshold.minDataPoints / threshold.dynamicData.length * 100 || !threshold.noindexThreshold;
}

/**
 * Generate unique content for city page
 */
export function generateCityUniqueContent(city: CityData): string {
  const parts: string[] = [];

  parts.push(`${city.name}, located in ${city.state}, is one of India's fastest-growing markets for WhatsApp e-commerce.`);

  if (city.merchantCount) {
    parts.push(`Over ${city.merchantCount.toLocaleString()} businesses in ${city.name} trust Flowauxi for their WhatsApp store.`);
  }

  if (city.orderVolume) {
    parts.push(`Merchants on Flowauxi in ${city.name} have processed ${city.orderVolume.toLocaleString()}+ orders via WhatsApp.`);
  }

  if (city.topCategories && city.topCategories.length > 0) {
    parts.push(`The most popular product categories in ${city.name} are: ${city.topCategories.slice(0, 3).join(", ")}.`);
  }

  if (city.avgOrderValue) {
    parts.push(`The average order value in ${city.name} is ₹${city.avgOrderValue.toLocaleString()}.`);
  }

  if (city.nearbyCities && city.nearbyCities.length > 0) {
    parts.push(`Flowauxi also serves merchants in nearby cities: ${city.nearbyCities.slice(0, 3).join(", ")}.`);
  }

  return parts.join(" ");
}

/**
 * Generate unique content for industry page
 */
export function generateIndustryUniqueContent(industry: IndustryData): string {
  const parts: string[] = [];

  parts.push(`${industry.name} is one of the fastest-growing sectors for WhatsApp e-commerce in India.`);

  if (industry.merchantCount) {
    parts.push(`Over ${industry.merchantCount.toLocaleString()} ${industry.name.toLowerCase()} businesses use Flowauxi.`);
  }

  if (industry.avgRevenue) {
    parts.push(`The average monthly revenue for ${industry.name.toLowerCase()} merchants on Flowauxi is ₹${industry.avgRevenue.toLocaleString()}.`);
  }

  if (industry.topProducts && industry.topProducts.length > 0) {
    parts.push(`Top-selling products in ${industry.name.toLowerCase()}: ${industry.topProducts.slice(0, 3).join(", ")}.`);
  }

  if (industry.useCases && industry.useCases.length > 0) {
    parts.push(`${industry.name} merchants commonly use Flowauxi for: ${industry.useCases[0].toLowerCase()}.`);
  }

  return parts.join(" ");
}

/**
 * Generate meta description for city page
 */
export function generateCityMetaDescription(city: CityData): string {
  const merchantStr = city.merchantCount ? `${city.merchantCount.toLocaleString()}+ businesses` : "businesses";
  const orderStr = city.orderVolume ? ` ${city.orderVolume.toLocaleString()}+ orders processed` : "";
  const categoryStr = city.topCategories?.length ? ` Popular categories: ${city.topCategories.slice(0, 2).join(", ")}` : "";

  return `Create your free WhatsApp online store in ${city.name}. Trusted by ${merchantStr} in ${city.state}.${orderStr}${categoryStr}. Start free today.`.slice(0, 155);
}

/**
 * Generate meta description for industry page
 */
export function generateIndustryMetaDescription(industry: IndustryData): string {
  const merchantStr = industry.merchantCount ? `${industry.merchantCount.toLocaleString()}+ businesses` : "businesses";
  const categoryStr = industry.categories.length > 0 ? ` Specializing in ${industry.categories[0]}` : "";

  return `${industry.name} WhatsApp store builder. ${merchantStr} trust Flowauxi${categoryStr}. AI chatbot, order automation, payments. Start free.`.slice(0, 155);
}