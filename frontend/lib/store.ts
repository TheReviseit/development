/**
 * Store Library - Server-side utilities for public store data
 * These functions fetch public-safe store data without authentication
 */

import { adminDb } from "@/lib/firebase-admin";

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
  colors?: string[];
  available: boolean;
  variantImages?: Record<string, { imageUrl: string; imagePublicId: string }>;
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
  businessName: string;
  logoUrl?: string;
  bannerUrl?: string;
  storeActive: boolean;
  categories: string[];
  products: StoreProduct[];
  banners: StoreBanner[];
}

/**
 * Raw business document from Firestore
 * Internal type - not exposed publicly
 */
interface BusinessDocument {
  userId?: string;
  businessName?: string;
  storeName?: string;
  logoUrl?: string;
  bannerUrl?: string;
  storeActive?: boolean;
  products?: RawProduct[];
  productCategories?: string[];
  banners?: StoreBanner[];
  // ... other private fields we don't expose
}

/**
 * Raw product from Firestore business document
 */
interface RawProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  description?: string;
  imageUrl?: string;
  sizes?: string[];
  colors?: string[];
  available?: boolean;
  stockStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  variantImages?: Record<string, { imageUrl: string; imagePublicId: string }>;
}

// ============================================================
// Store Queries
// ============================================================

/**
 * Fetch store by slug (which is the user's Firebase UID)
 * Returns null if store doesn't exist or is inactive
 *
 * @param storeSlug - The store identifier (Firebase UID)
 * @returns Public store data or null
 */
export async function getStoreBySlug(
  storeSlug: string,
): Promise<PublicStore | null> {
  try {
    const docRef = adminDb.collection("businesses").doc(storeSlug);
    const doc = await docRef.get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as BusinessDocument;

    // Check if store is active (default to true if field doesn't exist)
    const storeActive = data.storeActive !== false;
    if (!storeActive) {
      return null; // Treat inactive stores as not found
    }

    // Get products, filter available only, and sort
    const rawProducts = data.products || [];
    const products = filterAndSortProducts(rawProducts);

    // Return only public-safe fields
    return {
      id: storeSlug,
      businessName: data.businessName || data.storeName || "Store",
      logoUrl: data.logoUrl,
      bannerUrl: data.bannerUrl,
      storeActive: true,
      categories: data.productCategories || [],
      products,
      banners: data.banners || [],
    };
  } catch (error) {
    console.error("[store.ts] Error fetching store:", error);
    throw error; // Re-throw to let caller handle
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
    const docRef = adminDb.collection("businesses").doc(storeSlug);
    const doc = await docRef.get();

    if (!doc.exists) {
      return false;
    }

    const data = doc.data() as BusinessDocument;
    // Check if store is active
    return data.storeActive !== false;
  } catch (error) {
    console.error("[store.ts] Error checking store existence:", error);
    return false;
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
        description: p.description,
        imageUrl: p.imageUrl,
        sizes: p.sizes || [],
        colors: p.colors || [],
        available: true, // Already filtered, so always true
        variantImages: p.variantImages || {},
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
