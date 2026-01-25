"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import styles from "./products.module.css";
import SlidePanel from "@/app/utils/ui/SlidePanel";
import ProductForm from "@/app/dashboard/components/ProductCard/ProductForm";
import { ProductCard } from "@/app/dashboard/components/ProductCard";
import Toast from "@/app/components/Toast/Toast";
import { useAuth } from "@/app/components/auth/AuthProvider";
import { broadcastStoreUpdate } from "@/app/utils/storeSync";

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
  variants: Array<{
    id: string;
    color: string;
    size: string | string[];
    price: number;
    stock: number;
    imageUrl: string;
    imagePublicId: string;
    hasSizePricing?: boolean;
    sizePrices?: Record<string, number>;
  }>;
  sizes: string[];
  colors: string[];
  brand: string;
  materials: string[];
  variantImages?: Record<string, { imageUrl: string; imagePublicId: string }>;
  hasSizePricing?: boolean;
  sizePrices?: Record<string, number>;
  sizeStocks?: Record<string, number>;
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
        // Fetch from new normalized products API
        const response = await fetch("/api/products");
        if (response.ok) {
          const result = await response.json();
          // Map from normalized format to frontend format
          const mappedProducts = (result.products || []).map(
            (p: Record<string, unknown>) => ({
              id: p.id,
              name: p.name || "",
              category:
                ((p.category as Record<string, unknown>)?.name as string) || "",
              price: parseFloat(String(p.price)) || 0,
              compareAtPrice: p.compare_at_price
                ? parseFloat(String(p.compare_at_price))
                : undefined,
              priceUnit: p.price_unit || "INR",
              duration: p.duration || "",
              available: p.is_available !== false,
              description: p.description || "",
              sku: p.sku || "",
              stockStatus: p.stock_status || "in_stock",
              imageUrl: p.image_url || "",
              imagePublicId: p.image_public_id || "",
              originalSize: 0,
              optimizedSize: 0,
              // Map variants from API (snake_case to camelCase)
              variants: (
                (p.variants as Array<Record<string, unknown>>) || []
              ).map((v) => {
                // Handle size that might be stored as array, stringified array, or comma-separated string
                let sizeValue: string | string[] = v.size as string | string[];
                if (Array.isArray(sizeValue)) {
                  // Already an array, keep it
                } else if (
                  typeof sizeValue === "string" &&
                  sizeValue.trim().startsWith("[")
                ) {
                  try {
                    const parsed = JSON.parse(sizeValue);
                    if (Array.isArray(parsed)) {
                      sizeValue = parsed;
                    }
                  } catch {
                    // Keep original if parsing fails
                  }
                } else if (
                  typeof sizeValue === "string" &&
                  sizeValue.includes(",")
                ) {
                  // Parse comma-separated string to array
                  sizeValue = sizeValue
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                }

                return {
                  id: (v.id as string) || "",
                  color: (v.color as string) || "",
                  size: sizeValue || "",
                  price: parseFloat(String(v.price)) || 0,
                  compareAtPrice: v.compare_at_price
                    ? parseFloat(String(v.compare_at_price))
                    : undefined,
                  stock:
                    (v.stock_quantity as number) || (v.stock as number) || 0,
                  imageUrl: (v.image_url as string) || "",
                  imagePublicId: (v.image_public_id as string) || "",
                  hasSizePricing: (v.has_size_pricing as boolean) || false,
                  sizePrices:
                    (typeof v.size_prices === "string"
                      ? JSON.parse(v.size_prices)
                      : v.size_prices) || {},
                  sizeStocks:
                    (typeof v.size_stocks === "string"
                      ? JSON.parse(v.size_stocks)
                      : v.size_stocks) || {},
                };
              }),
              sizes: p.sizes || [],
              colors: p.colors || [],
              brand: p.brand || "",
              materials: p.materials || [],
              hasSizePricing: (p.has_size_pricing as boolean) || false,
              sizePrices:
                (typeof p.size_prices === "string"
                  ? JSON.parse(p.size_prices)
                  : p.size_prices) || {},
              sizeStocks:
                (typeof p.size_stocks === "string"
                  ? JSON.parse(p.size_stocks)
                  : p.size_stocks) || {},
            }),
          );
          setProducts(mappedProducts);
          // Categories from the response
          const categoryNames = (result.categories || []).map(
            (c: Record<string, unknown>) => c.name as string,
          );
          setProductCategories(categoryNames);
        }
      } catch (error) {
        console.error("Error loading products:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Save products to the backend (with debouncing for auto-save)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isSavingInBackground, setIsSavingInBackground] = useState(false);

  // Save a single product to the new normalized API
  const saveProduct = useCallback(
    async (product: Product, isNew = false) => {
      setSaving(true);
      setIsSavingInBackground(true);
      try {
        const productData = {
          name: product.name,
          description: product.description,
          sku: product.sku,
          brand: product.brand,
          price: product.price,
          // imagePublicId: product.imagePublicId,
          // duration: product.duration,
          imageUrl: product.imageUrl,
          imagePublicId: product.imagePublicId,
          duration: product.duration,
          sizes: product.sizes,
          colors: product.colors,
          materials: product.materials,
          available: product.available,
          category: product.category,
          hasSizePricing: product.hasSizePricing,
          sizePrices: product.sizePrices,
          sizeStocks: product.sizeStocks,
          // Map variants with correct field names for API (stock → stockQuantity)
          variants: (product.variants || []).map((v) => ({
            id: v.id,
            color: v.color || "",
            size: Array.isArray(v.size) ? v.size.join(", ") : v.size || "",
            price: v.price || 0,
            stockQuantity: v.stock || 0,
            imageUrl: v.imageUrl || "",
            imagePublicId: v.imagePublicId || "",
            hasSizePricing: v.hasSizePricing || false,
            sizePrices: v.sizePrices || {},
          })),
        };

        const url = isNew ? "/api/products" : `/api/products/${product.id}`;
        const method = isNew ? "POST" : "PUT";

        const response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(productData),
        });

        if (response.ok) {
          setMessage({ type: "success", text: "Product saved!" });
          if (storeSlug) {
            broadcastStoreUpdate(storeSlug);
          }
          return await response.json();
        } else {
          const error = await response.json();
          setMessage({ type: "error", text: error.error || "Failed to save" });
          return null;
        }
      } catch (error) {
        setMessage({ type: "error", text: "Connection error" });
        return null;
      } finally {
        setSaving(false);
        setIsSavingInBackground(false);
      }
    },
    [storeSlug],
  );

  // Legacy saveProducts for compatibility (not used anymore)
  const saveProducts = useCallback(
    async (updatedProducts: Product[], showMessage = true) => {
      // This function is kept for backward compatibility but won't be called
      console.log("saveProducts called - using new API now");
      if (showMessage) {
        setMessage({ type: "success", text: "Changes saved!" });
      }
    },
    [],
  );

  // Cleanup timeout on unmount (for saveTimeoutRef if needed)
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Immediate update handler - updates UI instantly, NO auto-save
  // Saves happen only when user clicks the tick button (onSave callback)
  // or when the ProductForm is submitted
  const handleProductUpdate = useCallback(
    (id: string, field: string, value: unknown) => {
      setProducts((prevProducts) => {
        const updated = prevProducts.map((p) =>
          p.id === id ? { ...p, [field]: value } : p,
        );
        // Update ref immediately for other callbacks
        productsRef.current = updated;
        // NO auto-save here - let user finish editing and click the tick button
        return updated;
      });
    },
    [],
  );

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

  // Save product (both add and edit) - uses new normalized API
  const handleProductSave = async (product: Product) => {
    const isNew = !editingProduct;
    const result = await saveProduct(product, isNew);

    if (result) {
      if (isNew && result.product) {
        // Add the new product with the server-generated ID
        const newProduct = { ...product, id: result.product.id };
        setProducts([...products, newProduct]);
      } else {
        // Update existing product in state
        setProducts(products.map((p) => (p.id === product.id ? product : p)));
      }
    }

    setIsProductPanelOpen(false);
    setEditingProduct(null);
  };

  // Cancel editing
  const handleProductCancel = () => {
    setIsProductPanelOpen(false);
    setEditingProduct(null);
  };

  // Delete product - uses new normalized API (soft delete)
  const removeProduct = async (id: string) => {
    try {
      const response = await fetch(`/api/products/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setProducts(products.filter((p) => p.id !== id));
        setMessage({ type: "success", text: "Product deleted" });
        if (storeSlug) {
          broadcastStoreUpdate(storeSlug);
        }
      } else {
        setMessage({ type: "error", text: "Failed to delete product" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Connection error" });
    }
  };

  // Add new category - uses new normalized API
  const handleAddCategory = async (categoryName: string) => {
    if (productCategories.includes(categoryName)) return;

    try {
      const response = await fetch("/api/products/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: categoryName }),
      });

      if (response.ok) {
        setProductCategories([...productCategories, categoryName]);
        setMessage({
          type: "success",
          text: `Category "${categoryName}" added!`,
        });
      } else {
        const error = await response.json();
        setMessage({
          type: "error",
          text: error.error || "Failed to add category",
        });
      }
    } catch (error) {
      console.error("Error saving category:", error);
    }
  };

  // Delete category - uses new normalized API
  const handleDeleteCategory = async (categoryName: string) => {
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

    try {
      const response = await fetch(
        `/api/products/categories?name=${encodeURIComponent(categoryName)}`,
        { method: "DELETE" },
      );

      if (response.ok) {
        setProductCategories(
          productCategories.filter((cat) => cat !== categoryName),
        );
        setMessage({
          type: "success",
          text: `Category "${categoryName}" deleted!`,
        });
      } else {
        setMessage({ type: "error", text: "Failed to delete category" });
      }
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

      {/* Auto-Save Indicator */}
      {isSavingInBackground && (
        <div className={styles.savingIndicator}>
          <div className={styles.savingSpinner} />
          <span>Saving...</span>
        </div>
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
            <span className={styles.storeLinkUrl} title={storeUrl}>
              {storeUrl}
            </span>
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
              onUpdate={handleProductUpdate}
              onRemove={removeProduct}
              onImageDeleted={() => {
                // Auto-save after image deletion - use ref for latest state
                saveProducts(productsRef.current, true);
              }}
              onSave={async (updatedProduct) => {
                // Save the updated product to database using the correct API function
                console.log(
                  "[ProductCard] onSave triggered, saving product...",
                );
                await saveProduct(updatedProduct as Product, false);
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
          onSave={(p) => handleProductSave(p as any)}
          onCancel={handleProductCancel}
          onAddCategory={handleAddCategory}
          onDeleteCategory={handleDeleteCategory}
          onImageDeleted={(updatedProduct) => {
            handleProductSave(updatedProduct as any);
          }}
        />
      </SlidePanel>
    </div>
  );
}
