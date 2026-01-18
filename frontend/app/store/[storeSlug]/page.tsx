"use client";

import React, { useState, useMemo, useEffect } from "react";
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
  Product,
} from "./components";

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

  // Fetch store data on mount
  useEffect(() => {
    async function fetchStoreData() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/store/${storeSlug}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
          if (response.status === 404) {
            // Store not found - will trigger notFound()
            setError("not_found");
          } else {
            setError(result.error || "Failed to load store");
          }
          return;
        }

        // Map API response to our types
        const data = result.data;
        setStoreData({
          id: data.id,
          businessName: data.businessName,
          logoUrl: data.logoUrl,
          bannerUrl: data.bannerUrl,
          products: data.products.map((p: Product) => ({
            id: p.id,
            name: p.name,
            category: p.category || "",
            price: p.price,
            description: p.description,
            imageUrl: p.imageUrl,
            sizes: p.sizes || [],
            colors: p.colors || [],
            available: true,
            variantImages: p.variantImages || {},
          })),
          categories: data.categories || [],
          banners: data.banners || [],
        });
      } catch (err) {
        console.error("[StorePage] Error fetching store:", err);
        setError("Failed to load store");
      } finally {
        setLoading(false);
      }
    }

    fetchStoreData();
  }, [storeSlug]);

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
