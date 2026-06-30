"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import styles from "../../store.module.css";
import { useCart } from "../../context/CartContext";
import type { PublicStore, StoreProduct } from "@/lib/store";
import {
  formatPrice,
  calculateDiscount,
  getPriceForSelection,
  getAvailableSizesForColor,
  getStockForSize,
  isSizeOutOfStock,
  getAvailableColors,
  getColorHex,
} from "@/lib/store/product";
import { CartDrawer, StoreFooter, StoreHeader } from "../../components";

interface ProductDetailClientProps {
  username: string;
  product: StoreProduct;
  storeData: PublicStore;
}

function getInitialColor(product: StoreProduct): string | null {
  return getAvailableColors(product)[0] || null;
}

function getInitialSize(product: StoreProduct, color: string | null): string | null {
  if (color) {
    const sizes = getAvailableSizesForColor(product, color);
    return sizes[0] || null;
  }
  return (product.sizes && product.sizes[0]) || null;
}

export default function ProductDetailClient({
  username,
  product,
  storeData,
}: ProductDetailClientProps) {
  const { addToCart, setIsCartOpen } = useCart();
  const [selectedColor, setSelectedColor] = useState<string | null>(() => getInitialColor(product));
  const [selectedSize, setSelectedSize] = useState<string | null>(() => getInitialSize(product, getInitialColor(product)));
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const colors = getAvailableColors(product);
  const sizes = selectedColor
    ? getAvailableSizesForColor(product, selectedColor)
    : product.sizes || [];

  const handleColorChange = useCallback((color: string) => {
    setSelectedColor(color);
    const newSizes = getAvailableSizesForColor(product, color);
    const inStock = newSizes.find((s) => !isSizeOutOfStock(product, s, color));
    setSelectedSize(inStock || newSizes[0] || null);
  }, [product]);

  const displayPrice = getPriceForSelection(product, selectedColor || undefined, selectedSize || undefined);
  const outOfStock = selectedSize
    ? isSizeOutOfStock(product, selectedSize, selectedColor || undefined)
    : false;

  const getImageForColor = (color: string | null): string | undefined => {
    if (!color) return product.imageUrl;
    if (product.variantImages?.[color]?.imageUrl) {
      return product.variantImages[color].imageUrl;
    }
    const variants = product.variants || [];
    const match = variants.find((v) => v.color === color);
    if (match?.imageUrl) return match.imageUrl;
    return product.imageUrl;
  };

  const displayImageUrl = getImageForColor(selectedColor);

  const handleAddToCart = () => {
    if (!product || outOfStock) return;
    setIsAddingToCart(true);

    addToCart(
      {
        id: product.id,
        name: product.name,
        price: displayPrice,
        imageUrl: product.imageUrl,
      },
      quantity,
      {
        size: selectedSize || undefined,
        color: selectedColor || undefined,
      },
    );

    setTimeout(() => {
      setIsAddingToCart(false);
      setIsCartOpen(true);
    }, 200);
  };

  const discount = product.compareAtPrice
    ? calculateDiscount(product.price, displayPrice)
    : 0;

  return (
    <div className={styles.storeContainer}>
      <StoreHeader
        storeName={storeData.businessName}
        logoUrl={storeData.logoUrl}
        onSearchClick={() => {}}
      />

      <main className={styles.storeContent}>
        <nav style={{ padding: "16px 0", fontSize: "14px", color: "#666" }}>
          <Link
            href={`/store/${username}`}
            style={{ color: "#666", textDecoration: "none" }}
          >
            ← Back to Store
          </Link>
        </nav>

        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "48px",
          background: "#fff",
          borderRadius: "16px",
          padding: "32px",
          marginBottom: "32px",
        }}>
          <div>
            {displayImageUrl ? (
              <img
                key={displayImageUrl}
                src={displayImageUrl}
                alt={product.name}
                style={{
                  width: "100%",
                  height: "auto",
                  borderRadius: "12px",
                  objectFit: "cover",
                  maxHeight: "500px",
                }}
              />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "400px",
                  background: "#f5f5f5",
                  borderRadius: "12px",
                  fontSize: "80px",
                  opacity: 0.3,
                }}
              >
                📦
              </div>
            )}

            {product.description && (
              <div style={{ marginTop: "24px" }}>
                <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "8px" }}>Description</h3>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#555" }}>
                  {product.description}
                </p>
              </div>
            )}
          </div>

          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "12px" }}>
              {product.name}
            </h1>

            <div style={{ marginBottom: "20px" }}>
              {product.compareAtPrice && product.compareAtPrice > 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "14px", color: "#999", textDecoration: "line-through" }}>
                    {formatPrice(product.price)}
                  </span>
                  <span style={{ fontSize: "28px", fontWeight: 700, color: "#1a1a1a" }}>
                    {formatPrice(displayPrice)}
                  </span>
                  {discount > 0 && (
                    <span style={{
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#22c55e",
                      background: "rgba(34,197,94,0.1)",
                      padding: "4px 8px",
                      borderRadius: "6px",
                    }}>
                      {discount}% OFF
                    </span>
                  )}
                </div>
              ) : (
                <span style={{ fontSize: "28px", fontWeight: 700 }}>
                  {formatPrice(displayPrice)}
                </span>
              )}
            </div>

            {colors.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <p style={{ fontSize: "14px", fontWeight: 500, marginBottom: "8px" }}>
                  Color: <span style={{ fontWeight: 400, color: "#666" }}>{selectedColor}</span>
                </p>
                <div style={{ display: "flex", gap: "8px" }}>
                  {colors.map((color) => {
                    const isSelected = selectedColor === color;
                    const isLight = ["white", "beige", "yellow", "gold", "silver", "cream", "ivory"].includes(color.toLowerCase());
                    return (
                      <button
                        key={color}
                        onClick={() => handleColorChange(color)}
                        title={color}
                        aria-label={`Select ${color} color`}
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "50%",
                          border: isSelected ? "2px solid #1a1a1a" : isLight ? "1px solid #e0e0e0" : "1px solid transparent",
                          backgroundColor: getColorHex(color),
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          outline: isSelected ? "3px solid rgba(0,0,0,0.1)" : "none",
                        }}
                      >
                        {isSelected && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isLight ? "#1a1a1a" : "#fff"} strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {sizes.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <p style={{ fontSize: "14px", fontWeight: 500, marginBottom: "8px" }}>Size</p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {sizes.map((size) => {
                    const isOos = isSizeOutOfStock(product, size, selectedColor || undefined);
                    const stockCount = getStockForSize(product, size, selectedColor || undefined);
                    return (
                      <button
                        key={size}
                        onClick={() => !isOos && setSelectedSize(size)}
                        disabled={isOos}
                        title={isOos ? "Out of Stock" : `${stockCount} in stock`}
                        aria-label={isOos ? `${size} - Out of Stock` : `Select size ${size}`}
                        style={{
                          padding: "8px 16px",
                          border: selectedSize === size ? "2px solid #1a1a1a" : "1px solid #ddd",
                          borderRadius: "8px",
                          background: isOos ? "#f5f5f5" : selectedSize === size ? "#1a1a1a" : "#fff",
                          color: isOos ? "#ccc" : selectedSize === size ? "#fff" : "#1a1a1a",
                          cursor: isOos ? "not-allowed" : "pointer",
                          fontWeight: 500,
                          fontSize: "14px",
                          opacity: isOos ? 0.5 : 1,
                          position: "relative",
                          overflow: "hidden",
                        }}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: "20px" }}>
              <p style={{ fontSize: "14px", fontWeight: 500, marginBottom: "8px" }}>Quantity</p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={outOfStock}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: outOfStock ? "not-allowed" : "pointer",
                    fontSize: "18px",
                    fontWeight: 600,
                    opacity: outOfStock ? 0.5 : 1,
                  }}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span style={{ fontSize: "16px", fontWeight: 600, minWidth: "24px", textAlign: "center" }}>
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  disabled={outOfStock}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    border: "1px solid #ddd",
                    background: "#fff",
                    cursor: outOfStock ? "not-allowed" : "pointer",
                    fontSize: "18px",
                    fontWeight: 600,
                    opacity: outOfStock ? 0.5 : 1,
                  }}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
            </div>

            <button
              onClick={handleAddToCart}
              disabled={outOfStock}
              style={{
                width: "100%",
                padding: "16px 32px",
                borderRadius: "12px",
                border: "none",
                background: outOfStock ? "#f5f5f5" : isAddingToCart ? "#e0e0e0" : "#1a1a1a",
                color: outOfStock ? "#999" : "#fff",
                fontSize: "16px",
                fontWeight: 600,
                cursor: outOfStock || isAddingToCart ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
              }}
            >
              {outOfStock
                ? "Out of Stock"
                : isAddingToCart
                  ? "Adding..."
                  : `Add to Cart — ${formatPrice(displayPrice * quantity)}`
              }
            </button>
          </div>
        </div>
      </main>

      <StoreFooter
        storeName={storeData.businessName}
        logoUrl={storeData.logoUrl}
      />

      <CartDrawer />
    </div>
  );
}
