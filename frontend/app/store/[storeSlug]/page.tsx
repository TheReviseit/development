"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { notFound } from "next/navigation";
import styles from "./store.module.css";
import {
  StoreHeader,
  CategoryNav,
  ProductGrid,
  ProductDetailModal,
  CartDrawer,
  SearchOverlay,
  CarouselBanner,
  StoreFooter, // Added
  Product,
} from "./components";
import {
  subscribeToStoreUpdates,
  onConnectionStatusChange,
  ConnectionStatus,
} from "@/app/utils/storeSync";

// ============================================================
// Demo/Mock Data - Shown only if store has no real products
// ============================================================
const DEMO_PRODUCTS: Product[] = [
  {
    id: "demo-1",
    name: "Premium Silk Saree - Kanchipuram",
    category: "Sarees",
    price: 12999,
    description:
      "Handwoven pure silk saree with intricate zari work. Perfect for weddings and festive occasions. Features traditional temple border design with pallu motifs.",
    imageUrl:
      "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600",
    sizes: ["Free Size"],
    colors: ["Red", "Gold", "Maroon", "Green"],
  },
  {
    id: "demo-2",
    name: "Cotton Kurta Set - Block Print",
    category: "Kurtas",
    price: 2499,
    description:
      "Comfortable pure cotton kurta with traditional block print patterns. Ideal for daily wear and casual occasions.",
    imageUrl:
      "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=600",
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: ["Blue", "White", "Yellow"],
  },
  {
    id: "demo-3",
    name: "Designer Lehenga Choli",
    category: "Lehengas",
    price: 18999,
    description:
      "Stunning designer lehenga with heavy embroidery work. Includes matching choli and dupatta. Perfect for sangeet and reception.",
    imageUrl:
      "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?w=600",
    sizes: ["S", "M", "L", "XL"],
    colors: ["Pink", "Peach", "Wine"],
  },
  {
    id: "demo-4",
    name: "Banarasi Dupatta",
    category: "Dupattas",
    price: 3499,
    description:
      "Authentic Banarasi silk dupatta with golden zari weaving. Versatile piece that elevates any outfit.",
    imageUrl:
      "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?w=600",
    sizes: ["Free Size"],
    colors: ["Red", "Blue", "Purple", "Orange"],
  },
  {
    id: "demo-5",
    name: "Embroidered Anarkali Suit",
    category: "Suits",
    price: 5999,
    description:
      "Floor-length Anarkali suit with intricate thread embroidery. Flowy silhouette perfect for parties.",
    imageUrl:
      "https://images.unsplash.com/photo-1585487000160-6ebcfceb0d03?w=600",
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: ["Navy", "Teal", "Burgundy"],
  },
  {
    id: "demo-6",
    name: "Printed Palazzo Set",
    category: "Palazzos",
    price: 1999,
    description:
      "Trendy palazzo set with digital print kurta. Comfortable rayon fabric ideal for summer.",
    imageUrl:
      "https://images.unsplash.com/photo-1583391733975-dae3a71ef3cc?w=600",
    sizes: ["S", "M", "L", "XL"],
    colors: ["Multicolor", "Black", "White"],
  },
  {
    id: "demo-7",
    name: "Handloom Cotton Saree",
    category: "Sarees",
    price: 4999,
    description:
      "Authentic handloom cotton saree from Bengal. Breathable fabric with traditional tant weave.",
    imageUrl:
      "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=600",
    sizes: ["Free Size"],
    colors: ["White", "Yellow", "Orange"],
  },
  {
    id: "demo-8",
    name: "Lucknowi Chikankari Kurta",
    category: "Kurtas",
    price: 3299,
    description:
      "Elegant white kurta with hand-embroidered chikankari work from Lucknow. Timeless classic piece.",
    imageUrl:
      "https://images.unsplash.com/photo-1594938291221-94f18cbb5660?w=600",
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: ["White", "Peach", "Light Blue"],
  },
];

// ============================================================
// Types
// ============================================================
interface StorePageProps {
  params: Promise<{ storeSlug: string }>;
}

interface StoreData {
  id: string;
  businessName: string;
  logoUrl?: string;
  bannerUrl?: string;
  products: Product[];
  categories: string[];
  banners: Array<{
    id: string;
    title: string;
    subtitle?: string;
    description?: string;
    buttonText?: string;
    buttonLink?: string;
    imageUrl: string;
    gradientFrom?: string;
    gradientTo?: string;
  }>;
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

// ============================================================
// Store Page Component
// ============================================================
export default function StorePage({ params }: StorePageProps) {
  // Unwrap params using React.use()
  const resolvedParams = React.use(params);
  const { storeSlug } = resolvedParams;

  // State
  const [storeData, setStoreData] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [realtimeStatus, setRealtimeStatus] =
    useState<ConnectionStatus>("disconnected");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Fetch store data function - can be called for initial load and refreshes
  const fetchStoreData = useCallback(
    async (isRefresh = false) => {
      try {
        if (!isRefresh) {
          setLoading(true);
        } else {
          setIsRefreshing(true);
        }
        setError(null);

        const response = await fetch(`/api/store/${storeSlug}`, {
          cache: "no-store", // Always get fresh data
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          if (response.status === 404) {
            setError("not_found");
          } else {
            setError(result.error || "Failed to load store");
          }
          return;
        }

        // Map API response to our types
        const data = result.data;
        const newStoreData: StoreData = {
          id: data.id,
          businessName: data.businessName,
          logoUrl: data.logoUrl,
          bannerUrl: data.bannerUrl,
          products: data.products.map((p: Product) => ({
            ...p,
            id: p.id,
            name: p.name,
            category: p.category || "",
            price: p.price,
            compareAtPrice: p.compareAtPrice,
            description: p.description,
            imageUrl: p.imageUrl,
            sizes: p.sizes || [],
            colors: p.colors || [],
            variants: p.variants || [],
            available: true,
            hasSizePricing: p.hasSizePricing,
            sizePrices: p.sizePrices,
            sizeStocks: p.sizeStocks,
            variantImages: p.variantImages || {},
          })),
          categories: data.categories || [],
          banners: data.banners || [],
          contact: data.contact || {},
          location: data.location || {},
          socialMedia: data.socialMedia || {},
        };

        setStoreData(newStoreData);

        // Also update selectedProduct if it was open
        if (selectedProduct && isRefresh) {
          const updatedProduct = newStoreData.products.find(
            (p) => p.id === selectedProduct.id,
          );
          if (updatedProduct) {
            setSelectedProduct(updatedProduct);
          }
        }

        if (isRefresh) {
          console.log("[StorePage] 🔄 Store data refreshed in real-time!");
        }
      } catch (err) {
        console.error("[StorePage] Error fetching store:", err);
        if (!isRefresh) {
          setError("Failed to load store");
        }
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [storeSlug, selectedProduct],
  );

  // Initial fetch on mount
  useEffect(() => {
    fetchStoreData(false);
  }, [storeSlug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time sync: Subscribe to updates from Dashboard
  // Uses Supabase Realtime (cross-device) + BroadcastChannel (same-browser)
  useEffect(() => {
    // Subscribe to store updates via Supabase Realtime + BroadcastChannel/localStorage
    const unsubscribe = subscribeToStoreUpdates(storeSlug, (event) => {
      console.log("[StorePage] 📡 Received real-time update event:", event);
      // Refetch store data when update is received
      fetchStoreData(true);
      setLastUpdated(new Date());
    });

    // Subscribe to connection status changes
    const unsubscribeStatus = onConnectionStatusChange((status) => {
      setRealtimeStatus(status);
    });

    return () => {
      unsubscribe();
      unsubscribeStatus();
    };
  }, [storeSlug, fetchStoreData]);

  // Fallback polling: Check for updates every 30 seconds
  // This serves as insurance when Supabase Realtime WebSocket might be blocked/disconnected
  useEffect(() => {
    const pollInterval = setInterval(() => {
      // Only poll if page is visible
      if (document.visibilityState === "visible") {
        fetchStoreData(true);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(pollInterval);
  }, [fetchStoreData]);

  // Handle 404 - store not found
  if (error === "not_found") {
    notFound();
  }

  // Products: use real products if available, otherwise fall back to demo
  const products = useMemo(() => {
    if (!storeData || storeData.products.length === 0) {
      return DEMO_PRODUCTS;
    }
    return storeData.products;
  }, [storeData]);

  // Check if using demo mode
  const isDemoMode = !storeData || storeData.products.length === 0;

  // Derive categories from products
  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [products]);

  // Filter products by category
  const filteredProducts = useMemo(() => {
    if (activeCategory === "All") return products;
    return products.filter((p) => p.category === activeCategory);
  }, [products, activeCategory]);

  // Store name: from API or derive from slug
  const storeName = storeData?.businessName || formatSlugToName(storeSlug);

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsProductModalOpen(true);
  };

  // Loading state
  if (loading) {
    return (
      <div className={styles.storeContainer}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner} />
          <p>Loading store...</p>
        </div>
      </div>
    );
  }

  // Error state (non-404)
  if (error && error !== "not_found") {
    return (
      <div className={styles.storeContainer}>
        <div className={styles.errorContainer}>
          <p>Unable to load store. Please try again later.</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.storeContainer}>
      <StoreHeader
        storeName={storeName}
        logoUrl={storeData?.logoUrl}
        onSearchClick={() => setIsSearchOpen(true)}
      />

      <main className={styles.storeContent}>
        <CarouselBanner
          slides={
            storeData?.banners && storeData.banners.length > 0
              ? storeData.banners
              : undefined
          }
        />

        {/* Demo mode indicator (optional - for store owner only) */}
        {isDemoMode && (
          <div className={styles.demoBanner}>
            <span>
              📦 Demo Products - Add your own products to see them here
            </span>
          </div>
        )}

        <CategoryNav
          categories={categories}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />

        <ProductGrid
          products={filteredProducts}
          onProductClick={handleProductClick}
        />
      </main>

      <StoreFooter
        storeName={storeName}
        logoUrl={storeData?.logoUrl}
        address={
          storeData?.location &&
          (storeData.location.address || storeData.location.city)
            ? [
                storeData.location.address,
                storeData.location.city,
                storeData.location.state,
                storeData.location.pincode,
              ]
                .filter(Boolean)
                .join(", ")
            : undefined
        }
        phone={storeData?.contact?.phone}
        email={storeData?.contact?.email}
        socialMedia={storeData?.socialMedia}
      />

      <CartDrawer />

      <ProductDetailModal
        product={selectedProduct}
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
      />

      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        products={products}
        onProductClick={handleProductClick}
      />
    </div>
  );
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Convert URL slug to readable store name
 * e.g., "my-awesome-store" -> "My Awesome Store"
 */
function formatSlugToName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
