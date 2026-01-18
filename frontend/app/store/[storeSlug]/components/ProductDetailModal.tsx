"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "../store.module.css";
import { useCart } from "../context/CartContext";
import { Product } from "./ProductCardStore";

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function ProductDetailModal({
  product,
  isOpen,
  onClose,
}: ProductDetailModalProps) {
  const { addToCart, setIsCartOpen } = useCart();
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);

  // Reset state when product changes
  useEffect(() => {
    if (product) {
      setSelectedSize(product.sizes?.[0] || null);
      setSelectedColor(product.colors?.[0] || null);
      setQuantity(1);
    }
  }, [product]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  // Color mapping for visual swatches
  const getColorHex = (colorName: string) => {
    const colorMap: { [key: string]: string } = {
      black: "#1a1a1a",
      white: "#ffffff",
      red: "#ef4444",
      blue: "#3b82f6",
      green: "#22c55e",
      yellow: "#eab308",
      pink: "#ec4899",
      purple: "#a855f7",
      orange: "#f97316",
      gray: "#6b7280",
      grey: "#6b7280",
      navy: "#1e3a5f",
      brown: "#8b5a2b",
      beige: "#d4b896",
      gold: "#ffd700",
      silver: "#c0c0c0",
      maroon: "#800000",
      olive: "#808000",
      teal: "#008080",
      coral: "#ff7f50",
      cyan: "#00ffff",
    };
    return colorMap[colorName.toLowerCase()] || "#6b7280";
  };

  const handleAddToCart = () => {
    if (!product) return;

    addToCart(
      {
        id: product.id,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
      },
      quantity,
      {
        size: selectedSize || undefined,
        color: selectedColor || undefined,
      },
    );

    onClose();
    setTimeout(() => setIsCartOpen(true), 200);
  };

  if (!product) return null;

  const selectedVariantImage =
    selectedColor && product.variantImages?.[selectedColor]?.imageUrl;
  const displayImageUrl = selectedVariantImage || product.imageUrl;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={`${styles.modalOverlay} ${
            isOpen ? styles.modalOverlayVisible : ""
          }`}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <button
              className={styles.modalCloseBtn}
              onClick={onClose}
              aria-label="Close"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Left Column - Image and Description */}
            <div className={styles.modalLeftColumn}>
              <div className={styles.modalImage}>
                {displayImageUrl ? (
                  <img
                    key={displayImageUrl}
                    src={displayImageUrl}
                    alt={product.name}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      fontSize: "80px",
                      opacity: 0.3,
                    }}
                  >
                    📦
                  </div>
                )}
              </div>

              {/* Description only - Below Image */}
              {product.description && (
                <div className={styles.modalProductInfo}>
                  <div className={styles.modalDescriptionWrapper}>
                    <p className={styles.modalDescription}>
                      {product.description}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Title, Price, Options and Cart */}
            <div className={styles.modalDetails}>
              {/* Title at top of right column */}
              <h2 className={styles.modalName}>{product.name}</h2>
              {/* Price */}
              <p className={styles.modalPrice}>{formatPrice(product.price)}</p>

              {/* Description - visible on mobile (hidden on desktop via CSS) */}
              {product.description && (
                <p className={styles.modalDescriptionMobile}>
                  {product.description}
                </p>
              )}

              {/* Size Selection */}
              {product.sizes && product.sizes.length > 0 && (
                <div className={styles.modalOptions}>
                  <p className={styles.modalOptionLabel}>Size</p>
                  <div className={styles.modalOptionList}>
                    {product.sizes.map((size) => (
                      <button
                        key={size}
                        className={`${styles.modalOptionBtn} ${
                          selectedSize === size
                            ? styles.modalOptionBtnActive
                            : ""
                        }`}
                        onClick={() => setSelectedSize(size)}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Color Selection - Visual Swatches */}
              {product.colors && product.colors.length > 0 && (
                <div className={styles.modalOptions}>
                  <p className={styles.modalOptionLabel}>Color</p>
                  <div className={styles.modalColorSwatches}>
                    {product.colors.map((color) => {
                      const colorHex = getColorHex(color);
                      const isSelected = selectedColor === color;
                      const isLightColor = [
                        "white",
                        "beige",
                        "yellow",
                        "gold",
                        "silver",
                        "cream",
                        "ivory",
                      ].includes(color.toLowerCase());
                      return (
                        <button
                          key={color}
                          className={`${styles.modalColorSwatch} ${
                            isSelected ? styles.modalColorSwatchActive : ""
                          }`}
                          onClick={() => setSelectedColor(color)}
                          title={color}
                          aria-label={`Select ${color} color`}
                          style={{
                            backgroundColor: colorHex,
                            borderColor: isSelected
                              ? "#1a1a1a"
                              : isLightColor
                                ? "#e0e0e0"
                                : "transparent",
                          }}
                        >
                          {isSelected && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke={isLightColor ? "#1a1a1a" : "#ffffff"}
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {selectedColor && (
                    <p className={styles.selectedColorName}>{selectedColor}</p>
                  )}
                </div>
              )}

              {/* Quantity */}
              <div className={styles.modalQuantity}>
                <span className={styles.modalQuantityLabel}>Quantity</span>
                <div className={styles.quantityControl}>
                  <button
                    className={styles.quantityBtn}
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className={styles.quantityValue}>{quantity}</span>
                  <button
                    className={styles.quantityBtn}
                    onClick={() => setQuantity(quantity + 1)}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>

              <button className={styles.modalAddBtn} onClick={handleAddToCart}>
                Add to Cart — {formatPrice(product.price * quantity)}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
