"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import styles from "./store.module.css";
import {
  StoreHeader,
  NewArrivalsSection,
  CategorySection,
  ProductDetailModal,
  CartDrawer,
  SearchOverlay,
  CarouselBanner,
  StoreFooter,
  Product,
} from "./components";
import {
  subscribeToStoreUpdates,
  onConnectionStatusChange,
  ConnectionStatus,
} from "@/app/utils/storeSync";
import { PublicStore } from "@/lib/store";

const DEMO_PRODUCTS: Product[] = [
  {
    id: "demo-1",
    name: "Premium Silk Saree - Kanchipuram",
    category: "Sarees",
    price: 12999,
    description:
      "Handwoven pure silk saree with intricate zari work. Perfect for weddings and festive occasions. Features traditional temple border design with pallu motifs.",
    imageUrl:
      "https://images.unsplash.com/photo-1583391733956-f086e3f49ce1?w=600",
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
      "https://images.unsplash.com/photo-1617114919297-3c8ddb01f599?w=600",
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
      "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600",
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
      "https://images.unsplash.com/photo-1583391733975-dae3a71ef3cc?w=600",
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
      "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=600",
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
      "https://images.unsplash.com/photo-1589810635657-232948472d98?w=600",
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
      "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600",
    sizes: ["S", "M", "L", "XL", "XXL"],
    colors: ["White", "Peach", "Light Blue"],
  },
];

interface StoreClientPageProps {
  username: string;
  initialData: PublicStore | null;
}

export default function StoreClientPage({
  username,
  initialData,
}: StoreClientPageProps) {
  const [storeData, setStoreData] = useState<PublicStore | null>(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [realtimeStatus, setRealtimeStatus] =
    useState<ConnectionStatus>("disconnected");

  // Refresh store data for real-time updates (not initial load)
  const refreshStoreData = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const response = await fetch(`/api/store/${username}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (response.ok && result.success) {
        setStoreData(result.data);
        if (selectedProduct) {
          const updated = result.data.products?.find(
            (p: Product) => p.id === selectedProduct.id,
          );
          if (updated) setSelectedProduct(updated);
        }
        console.log("[StorePage] Store data refreshed in real-time!");
      }
    } catch (err) {
      console.error("[StorePage] Error refreshing store:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [username, selectedProduct]);

  // Real-time sync: Subscribe to updates from Dashboard
  const realtimeStoreId = storeData?.userId || username;

  useEffect(() => {
    const unsubscribe = subscribeToStoreUpdates(realtimeStoreId, () => {
      refreshStoreData();
    });
    const unsubscribeStatus = onConnectionStatusChange((status) => {
      setRealtimeStatus(status);
    });
    return () => {
      unsubscribe();
      unsubscribeStatus();
    };
  }, [realtimeStoreId, refreshStoreData]);

  // Fallback polling every 30 seconds
  useEffect(() => {
    const pollInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        refreshStoreData();
      }
    }, 30000);
    return () => clearInterval(pollInterval);
  }, [refreshStoreData]);

  // Products: use real products if available, otherwise fall back to demo
  const products = useMemo(() => {
    if (!storeData || storeData.products.length === 0) {
      return DEMO_PRODUCTS;
    }
    return storeData.products as Product[];
  }, [storeData]);

  const isDemoMode = !storeData || storeData.products.length === 0;

  // New arrivals: first 4 products (already sorted newest-first from server)
  const newArrivals = useMemo(() => products.slice(0, 4), [products]);

  // Group remaining products by category (preserving order)
  const categorySections = useMemo(() => {
    const categoryMap = new Map<string, Product[]>();
    products.forEach((p) => {
      const cat = p.category || "Other";
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, []);
      }
      categoryMap.get(cat)!.push(p);
    });
    return Array.from(categoryMap.entries());
  }, [products]);

  const storeName = storeData?.businessName || formatSlugToName(username);

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsProductModalOpen(true);
  };

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

        {isDemoMode && (
          <div className={styles.demoBanner}>
            <span>
              Demo Products — Add your own products to see them here
            </span>
          </div>
        )}

        <NewArrivalsSection
          products={newArrivals}
          onProductClick={handleProductClick}
        />

        {categorySections.map(([categoryName, categoryProducts]) => (
          <CategorySection
            key={categoryName}
            categoryName={categoryName}
            products={categoryProducts}
            onProductClick={handleProductClick}
          />
        ))}
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

function formatSlugToName(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
