/**
 * Store Library - Server-side utilities for public store data
 *
 * Production-grade store data fetching from Supabase.
 * This module provides public-safe store data for the shop page.
 *
 * Data Flow:
 * - Dashboard saves products via /api/business/save → Supabase
 * - Shop reads products via this module → Supabase
 * - Consistent data source ensures products appear immediately
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Supabase Client Configuration
// ============================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Singleton Supabase client for server-side operations
let supabaseInstance: SupabaseClient | null = null;

/**
 * Get or create Supabase client with service role key
 * Service role bypasses RLS - safe for server-side only
 */
function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error(
        "[store.ts] Missing Supabase credentials. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      );
    }
    supabaseInstance = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseInstance;
}

// ============================================================
// Types - Public-safe product and store types
// ============================================================

/**
 * Public-safe product type for store display
 * Only includes fields safe to expose publicly
 */
export interface StoreProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  imageUrl?: string;
  sizes?: string[];
  colors?: string | string[];
  available: boolean;
  variants?: Array<{
    id: string;
    color: string;
    size: string | string[];
    price: number;
    compareAtPrice?: number;
    stock: number;
    imageUrl?: string;
    imagePublicId?: string;
    sizeStocks?: Record<string, number>;
    hasSizePricing?: boolean;
    sizePrices?: Record<string, number>;
  }>;
  variantImages?: Record<string, { imageUrl: string; imagePublicId: string }>;
  hasSizePricing?: boolean;
  sizePrices?: Record<string, number>;
  sizeStocks?: Record<string, number>;
  compareAtPrice?: number;
}

/**
 * Public-safe banner type for store carousel
 */
export interface StoreBanner {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  buttonText?: string;
  buttonLink?: string;
  imageUrl: string;
  gradientFrom?: string;
  gradientTo?: string;
}

/**
 * Public-safe store type
 * Excludes sensitive business data
 */
export interface PublicStore {
  id: string;
  userId?: string; // ✅ Firebase UID for real-time subscriptions
  businessName: string;
  canonicalSlug?: string; // ✅ Canonical URL slug for SEO and redirects
  planTier?: "starter" | "business" | "pro"; // ✅ Plan tier for UI differentiation
  logoUrl?: string;
  bannerUrl?: string;
  storeActive: boolean;
  categories: string[];
  products: StoreProduct[];
  banners: StoreBanner[];
  contact?: {
    phone?: string;
    email?: string;
    whatsapp?: string;
    website?: string;
  };
  location?: {
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    googleMapsLink?: string;
    landmarks?: string[];
  };
  socialMedia?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
  };
}

/**
 * Raw business data from Supabase (snake_case)
 */
interface SupabaseBusinessData {
  user_id: string;
  business_name?: string;
  logo_url?: string;
  banner_url?: string;
  store_active?: boolean;
  products?: RawProduct[];
  product_categories?: string[];
  banners?: StoreBanner[];
}

/**
 * Raw product from database
 */
interface RawProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  compareAtPrice?: number;
  description?: string;
  imageUrl?: string;
  sizes?: string[];
  colors?: string | string[];
  available?: boolean;
  stockStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  variants?: Array<{
    id: string;
    color: string;
    size: string | string[];
    price: number;
    stock: number;
    imageUrl?: string;
    imagePublicId?: string;
    sizeStocks?: Record<string, number>;
  }>;
  variantImages?: Record<string, { imageUrl: string; imagePublicId: string }>;
  hasSizePricing?: boolean;
  sizePrices?: Record<string, number>;
  sizeStocks?: Record<string, number>;
}

// ============================================================
// Store Queries
// ============================================================

/**
 * Fetch store by slug (which is the user's Firebase UID)
 * Returns null if store doesn't exist or is inactive
 *
 * Production-grade implementation:
 * - Reads from Supabase (primary data source)
 * - Uses service role key to bypass RLS
 * - Proper error handling and logging
 * - Graceful degradation on errors
 *
 * @param storeSlug - The store identifier (Firebase UID / user_id)
 * @returns Public store data or null
 */
export async function getStoreBySlug(
  storeSlug: string,
): Promise<PublicStore | null> {
  try {
    const supabase = getSupabase();

    // ✅ ENTERPRISE SLUG RESOLUTION
    // Normalize input for case-insensitive matching
    const normalized = storeSlug.toLowerCase().trim();
    let userId: string;
    let canonicalSlug: string = storeSlug;

    // STEP 1: Try businesses.url_slug_lower (PRIMARY - canonical URL)
    const { data: businessBySlug, error: slugError } = await supabase
      .from("businesses")
      .select("user_id, url_slug")
      .eq("url_slug_lower", normalized)
      .limit(1)
      .maybeSingle();

    console.log(`[store.ts] STEP1 slug lookup "${normalized}":`, {
      found: !!businessBySlug,
      error: slugError?.message,
    });

    if (businessBySlug && businessBySlug.url_slug) {
      // Resolve via business slug — no entitlement check on public READ path.
      userId = businessBySlug.user_id;
      canonicalSlug = businessBySlug.url_slug;
      console.log(
        `[store.ts] ✅ Resolved via business slug: ${normalized} → userId=${userId}`,
      );
    } else {
      // STEP 2: Try users.username_lower (LEGACY fallback)
      const { data: userByUsername } = await supabase
        .from("users")
        .select("firebase_uid, username")
        .eq("username_lower", normalized)
        .limit(1)
        .maybeSingle();

      if (userByUsername) {
        userId = userByUsername.firebase_uid;

        // Check if this user has a business slug
        const { data: bizData } = await supabase
          .from("businesses")
          .select("url_slug")
          .eq("user_id", userId)
          .limit(1)
          .maybeSingle();

        if (bizData && bizData.url_slug) {
          // User has a slug - this should be the canonical URL
          canonicalSlug = bizData.url_slug;
          console.log(
            `[store.ts] 🔀 Resolved via username, canonical is slug: ${normalized} → ${canonicalSlug}`,
          );
        } else {
          // No slug yet, username is canonical for now
          canonicalSlug = userByUsername.username.toLowerCase();
          console.log(
            `[store.ts] 📛 Resolved via username (no slug): ${normalized}`,
          );
        }
      } else {
        // STEP 3: Fallback - treat as user_id (Firebase UID) for backward compatibility
        userId = storeSlug;
        console.log(`[store.ts] 🆔 Treating as Firebase UID: ${storeSlug}`);
      }
    }

    // Query Supabase businesses table by user_id
    console.log(`[store.ts] Querying businesses by user_id="${userId}"`);
    const { data: businessData, error: businessError } = await supabase
      .from("businesses")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    console.log(`[store.ts] Business query result:`, {
      found: !!businessData,
      error: businessError?.message,
      store_active: businessData?.store_active,
    });

    if (businessError) {
      console.error("[store.ts] Supabase business query error:", businessError);
      throw businessError;
    }

    if (!businessData) {
      console.log(`[store.ts] No store found for userId: ${userId}`);
      return null;
    }

    // Check if store is active (default to true if field doesn't exist in schema)
    // Note: store_active column may not exist in all DB versions - default to active
    const storeActive = businessData.store_active !== false;
    if (storeActive === false) {
      console.log(`[store.ts] Store is inactive: ${storeSlug}`);
      return null;
    }

    // ── Resolve plan tier for this user (shop domain) ───────────────
    let planTier: "starter" | "business" | "pro" = "starter";
    try {
      const { data: subData } = await supabase
        .from("subscriptions")
        .select("pricing_plan:pricing_plans(plan_slug)")
        .eq("user_id", userId)
        .eq("product_domain", "shop")
        .in("status", ["active", "trialing", "completed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subData?.pricing_plan) {
        const pp = subData.pricing_plan as unknown;
        // Supabase may return joined data as array or object
        const planObj = Array.isArray(pp) ? pp[0] : pp;
        const slug = (planObj as { plan_slug: string })?.plan_slug;
        if (slug === "business" || slug === "pro") {
          planTier = slug;
        }
      }
    } catch (planErr) {
      console.warn(`[store.ts] ⚠️ Could not resolve plan tier:`, planErr);
    }

    // Fetch products from NORMALIZED products table
    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select(
        `
        *,
        category:product_categories(id, name),
        variants:product_variants(*)
      `,
      )
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .eq("is_available", true)
      .order("created_at", { ascending: false });

    if (productsError) {
      console.error("[store.ts] Products query error:", productsError);
      // Fall back to JSONB if normalized table query fails
      console.log("[store.ts] Falling back to JSONB products");
      const rawProducts = businessData.products || [];
      const products = filterAndSortProducts(rawProducts);
      return {
        id: storeSlug,
        userId, // ✅ Firebase UID for real-time subscriptions
        businessName: businessData.business_name || "Store",
        canonicalSlug, // ✅ Include canonical slug in fallback too
        planTier, // ✅ Plan tier for UI differentiation
        logoUrl: businessData.logo_url,
        bannerUrl: businessData.banner_url,
        storeActive: true,
        categories: businessData.product_categories || [],
        products,
        banners: businessData.banners || [],
      };
    }

    // Map normalized products to StoreProduct format
    const products: StoreProduct[] = (productsData || []).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category?.name || "",
      price: parseFloat(p.price) || 0,
      compareAtPrice: p.compare_at_price
        ? parseFloat(p.compare_at_price)
        : undefined,
      description: p.description,
      imageUrl: p.image_url,
      sizes: p.sizes || [],
      colors: p.colors || [],
      available: true,
      variants: (p.variants || []).map((v: Record<string, unknown>) => {
        // Handle size that might be stored as array or string
        let sizeValue = v.size || "";
        if (Array.isArray(sizeValue)) {
          // If it's an array like ["4XL"], join them or take first
          sizeValue = sizeValue.join(", ");
        } else if (typeof sizeValue === "string" && sizeValue.startsWith("[")) {
          // If it's a stringified array like '["4XL"]', parse and join
          try {
            const parsed = JSON.parse(sizeValue);
            if (Array.isArray(parsed)) {
              sizeValue = parsed.join(", ");
            }
          } catch {
            // Keep original if parsing fails
          }
        }
        return {
          id: v.id,
          color: v.color || "",
          size: sizeValue,
          price: v.price ? parseFloat(String(v.price)) : 0,
          compareAtPrice: v.compare_at_price
            ? parseFloat(String(v.compare_at_price))
            : undefined,
          stock: v.stock_quantity || 0,
          imageUrl: v.image_url || "",
          imagePublicId: v.image_public_id || "",
          hasSizePricing: v.has_size_pricing || false,
          sizePrices: v.size_prices || {},
          sizeStocks: v.size_stocks || {}, // CRITICAL FIX: was missing!
        };
      }),
      variantImages: {},
      hasSizePricing: p.has_size_pricing || false,
      sizePrices: p.size_prices || {},
      sizeStocks: p.size_stocks || {},
    }));

    // Fetch categories from normalized table
    const { data: categoriesData } = await supabase
      .from("product_categories")
      .select("name")
      .eq("user_id", userId)
      .eq("is_active", true);

    const categories = (categoriesData || []).map((c) => c.name);

    console.log(
      `[store.ts] ✅ Loaded ${products.length} products from normalized tables for store: ${storeSlug}`,
    );

    // Return only public-safe fields
    return {
      id: storeSlug,
      userId, // ✅ Firebase UID for real-time subscriptions
      businessName: businessData.business_name || "Store",
      canonicalSlug, // ✅ Include canonical slug for redirect detection
      planTier, // ✅ Plan tier for UI differentiation
      logoUrl: businessData.logo_url,
      bannerUrl: businessData.banner_url,
      storeActive: true,
      categories,
      products,
      banners: businessData.banners || [],
      contact: businessData.contact || {},
      location: businessData.location || {},
      socialMedia: businessData.social_media || {},
    };
  } catch (error) {
    console.error("[store.ts] CRITICAL Error fetching store:", error);
    console.error("[store.ts] Error details:", JSON.stringify(error, null, 2));
    // In production, we don't throw - return null to show "store not found"
    // This prevents 500 errors from breaking the user experience
    return null;
  }
}

/**
 * Check if a store exists and is valid
 * Lighter query than full store fetch
 *
 * @param storeSlug - The store identifier
 * @returns boolean
 */
export async function storeExists(storeSlug: string): Promise<boolean> {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("businesses")
      .select("user_id")
      .eq("user_id", storeSlug)
      .maybeSingle();

    if (error || !data) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("[store.ts] Error checking store existence:", error);
    return false;
  }
}

// ============================================================
// Sitemap Support — Active Store Listings
// ============================================================

/**
 * Lightweight store listing for sitemap generation.
 */
export interface StoreSitemapEntry {
  slug: string;
  businessName: string;
  updatedAt: string;
}

/**
 * Fetch all active store slugs for sitemap generation.
 * Uses a lightweight SELECT query (no products, no variants).
 *
 * @returns Array of { slug, businessName, updatedAt }
 */
export async function getAllActiveStoreSlugs(): Promise<StoreSitemapEntry[]> {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("businesses")
      .select("user_id, url_slug, business_name, updated_at")
      .not("store_active", "is", false)
      .not("business_name", "is", null)
      .order("updated_at", { ascending: false })
      .limit(5000); // Safety cap for sitemap

    if (error) {
      console.error(
        "[store.ts] Error fetching active stores for sitemap:",
        error,
      );
      return [];
    }

    return (data || []).map((row) => ({
      slug: row.url_slug || row.user_id,
      businessName: row.business_name || "Store",
      updatedAt: row.updated_at || new Date().toISOString(),
    }));
  } catch (err) {
    console.error("[store.ts] getAllActiveStoreSlugs failed:", err);
    return [];
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Filter and sort products for public display
 * - Only include available products
 * - Sort by most recently updated/created
 *
 * @param products - Raw products from database
 * @returns Filtered and sorted public products
 */
function filterAndSortProducts(products: RawProduct[]): StoreProduct[] {
  return (
    products
      // Filter: only available products (default to available if field missing)
      .filter((p) => {
        const isAvailable = p.available !== false;
        const inStock = p.stockStatus !== "out_of_stock";
        return isAvailable && inStock;
      })
      // Sort: newest first (by updatedAt, then createdAt, then id as fallback)
      .sort((a, b) => {
        const dateA = a.updatedAt || a.createdAt || a.id;
        const dateB = b.updatedAt || b.createdAt || b.id;
        return dateB.localeCompare(dateA);
      })
      // Map to public-safe fields only
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category || "",
        price: p.price || 0,
        compareAtPrice: p.compareAtPrice,
        description: p.description,
        imageUrl: p.imageUrl,
        sizes: p.sizes || [],
        colors: p.colors || [],
        available: true, // Already filtered, so always true
        variants: p.variants || [],
        variantImages: p.variantImages || {},
        hasSizePricing: p.hasSizePricing,
        sizePrices: p.sizePrices,
        sizeStocks: p.sizeStocks,
      }))
  );
}

/**
 * Get unique categories from products
 *
 * @param products - Store products
 * @returns Array of unique category names
 */
export function getProductCategories(products: StoreProduct[]): string[] {
  const categories = new Set(products.map((p) => p.category).filter(Boolean));
  return Array.from(categories);
}
