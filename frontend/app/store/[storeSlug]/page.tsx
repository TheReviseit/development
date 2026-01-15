"use client";

import React, { useState, useMemo, use } from "react";
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

// Mock data for development - will be replaced with API fetch
const MOCK_PRODUCTS: Product[] = [
  {
    id: "1",
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
    id: "2",
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
    id: "3",
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
    id: "4",
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
    id: "5",
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
    id: "6",
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
    id: "7",
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
    id: "8",
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

interface StorePageProps {
  params: Promise<{ storeSlug: string }>;
}

export default function StorePage({ params }: StorePageProps) {
  const { storeSlug } = use(params);

  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // For now, using mock products - will be replaced with API fetch
  const products = MOCK_PRODUCTS;

  // Derive unique categories from products
  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [products]);

  // Filter products by category
  const filteredProducts = useMemo(() => {
    if (activeCategory === "All") return products;
    return products.filter((p) => p.category === activeCategory);
  }, [products, activeCategory]);

  // Generate display name from slug
  const storeName = storeSlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setIsProductModalOpen(true);
  };

  return (
    <div className={styles.storeContainer}>
      <StoreHeader
        storeName={storeName}
        onSearchClick={() => setIsSearchOpen(true)}
      />

      <main className={styles.storeContent}>
        <CarouselBanner />

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
