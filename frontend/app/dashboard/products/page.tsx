"use client";

import { useState, useEffect, useRef } from "react";
import styles from "./products.module.css";
import SlidePanel from "@/app/utils/ui/SlidePanel";
import ProductForm from "@/app/dashboard/components/ProductCard/ProductForm";
import { ProductCard } from "@/app/dashboard/components/ProductCard";
import Toast from "@/app/components/Toast/Toast";
import { useAuth } from "@/app/components/auth/AuthProvider";

// Product type definition
interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  priceUnit: string;
  duration: string;
  available: boolean;
  description: string;
  sku: string;
  stockStatus: string;
  imageUrl: string;
  imagePublicId: string;
  originalSize: number;
  optimizedSize: number;
  variants: string[];
  sizes: string[];
  colors: string[];
  brand: string;
  materials: string[];
  variantImages?: Record<string, { imageUrl: string; imagePublicId: string }>;
}

export default function ProductsPage() {
  const { firebaseUser } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [productCategories, setProductCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isProductPanelOpen, setIsProductPanelOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Store URL
  const storeSlug = firebaseUser?.uid || "";
  const storeUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/store/${storeSlug}`
      : `/store/${storeSlug}`;

  const handleCopyStoreLink = async () => {
    try {
      await navigator.clipboard.writeText(storeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Filter products based on search query
  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Ref to always have latest products for async operations (fixes stale closure)
  const productsRef = useRef(products);
  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  // Load products and categories on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch("/api/business/get");
        if (response.ok) {
          const result = await response.json();
          if (result.data) {
            setProducts(result.data.products || []);
            setProductCategories(result.data.productCategories || []);
          }
        }
      } catch (error) {
        console.error("Error loading products:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Save products to the backend
  const saveProducts = async (updatedProducts: Product[]) => {
    setSaving(true);
    try {
      const response = await fetch("/api/business/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: updatedProducts,
          productCategories,
        }),
      });

      if (response.ok) {
        setMessage({ type: "success", text: "Products saved successfully!" });
      } else {
        setMessage({ type: "error", text: "Failed to save products" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save products" });
    } finally {
      setSaving(false);
    }
  };

  // Add new product
  const addProduct = () => {
    setEditingProduct(null);
    setIsProductPanelOpen(true);
  };

  // Edit existing product
  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsProductPanelOpen(true);
  };

  // Save product (both add and edit)
  const handleProductSave = async (product: Product) => {
    let updatedProducts: Product[];
    if (editingProduct) {
      updatedProducts = products.map((p) =>
        p.id === product.id ? product : p,
      );
    } else {
      updatedProducts = [...products, product];
    }
    setProducts(updatedProducts);
    setIsProductPanelOpen(false);
    setEditingProduct(null);
    await saveProducts(updatedProducts);
  };

  // Cancel editing
  const handleProductCancel = () => {
    setIsProductPanelOpen(false);
    setEditingProduct(null);
  };

  // Delete product
  const removeProduct = async (id: string) => {
    const updatedProducts = products.filter((p) => p.id !== id);
    setProducts(updatedProducts);
    await saveProducts(updatedProducts);
  };

  // Add new category
  const handleAddCategory = async (categoryName: string) => {
    // Avoid duplicates
    if (productCategories.includes(categoryName)) return;

    const updatedCategories = [...productCategories, categoryName];
    setProductCategories(updatedCategories);

    // Save to backend
    try {
      await fetch("/api/business/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productCategories: updatedCategories }),
      });
      setMessage({
        type: "success",
        text: `Category "${categoryName}" added!`,
      });
    } catch (error) {
      console.error("Error saving category:", error);
    }
  };

  // Delete category
  const handleDeleteCategory = async (categoryName: string) => {
    // Check if any product uses this category
    const productsUsingCategory = products.filter(
      (p) => p.category === categoryName,
    );
    if (productsUsingCategory.length > 0) {
      setMessage({
        type: "error",
        text: `Cannot delete "${categoryName}" - ${productsUsingCategory.length} product(s) use this category`,
      });
      return;
    }

    const updatedCategories = productCategories.filter(
      (cat) => cat !== categoryName,
    );
    setProductCategories(updatedCategories);

    // Save to backend
    try {
      await fetch("/api/business/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productCategories: updatedCategories }),
      });
      setMessage({
        type: "success",
        text: `Category "${categoryName}" deleted!`,
      });
    } catch (error) {
      console.error("Error deleting category:", error);
    }
  };

  // Auto-dismiss message
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading products...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Products</h1>
          <p className={styles.subtitle}>
            Manage your product catalog. Your AI assistant can recommend these
            products to customers.
          </p>
        </div>
        <div className={styles.searchBox}>
          <svg
            className={styles.searchIcon}
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className={styles.clearButton}
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Toast Message */}
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
          duration={3000}
        />
      )}

      {/* Store Link Banner */}
      {storeSlug && (
        <div className={styles.storeLinkBanner}>
          <div className={styles.storeLinkInfo}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span className={styles.storeLinkLabel}>Your Store:</span>
            <span className={styles.storeLinkUrl}>{storeUrl}</span>
          </div>
          <div className={styles.storeLinkActions}>
            <button
              className={styles.copyLinkBtn}
              onClick={handleCopyStoreLink}
            >
              {copied ? (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy
                </>
              )}
            </button>
            <button
              className={styles.openStoreBtn}
              onClick={() => window.open(storeUrl, "_blank")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Open Store
            </button>
          </div>
        </div>
      )}

      {/* Products Grid */}
      {products.length === 0 ? (
        <div className={styles.emptyState}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path
              d="M16 10a4 4 0 0 1-8 0"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h3>No products yet</h3>
          <p>Add products using the sidebar menu to get started</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className={styles.emptyState}>
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <h3>No products found</h3>
          <p>Try a different search term</p>
        </div>
      ) : (
        <div className={styles.productsGrid}>
          {filteredProducts.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              index={index}
              isEcommerce={true}
              productCategories={productCategories}
              onUpdate={(id, field, value) => {
                const updatedProducts = products.map((p) =>
                  p.id === id ? { ...p, [field]: value } : p,
                );
                setProducts(updatedProducts);
              }}
              onRemove={removeProduct}
              onImageDeleted={() => {
                // Auto-save after image deletion - use ref for latest state
                saveProducts(productsRef.current);
              }}
              onSave={() => {
                // Save when tick button is clicked - use ref for latest state
                console.log(
                  "[ProductCard] onSave triggered, saving products...",
                );
                setTimeout(() => saveProducts(productsRef.current), 300);
              }}
            />
          ))}
        </div>
      )}

      {/* Product Add/Edit SlidePanel */}
      <SlidePanel
        isOpen={isProductPanelOpen}
        onClose={handleProductCancel}
        title={editingProduct ? "Edit Product" : "Add Product"}
      >
        <ProductForm
          product={editingProduct || undefined}
          isEcommerce={true}
          productCategories={productCategories}
          onSave={handleProductSave}
          onCancel={handleProductCancel}
          onAddCategory={handleAddCategory}
          onDeleteCategory={handleDeleteCategory}
          onImageDeleted={(updatedProduct) => {
            handleProductSave(updatedProduct);
          }}
        />
      </SlidePanel>
    </div>
  );
}
