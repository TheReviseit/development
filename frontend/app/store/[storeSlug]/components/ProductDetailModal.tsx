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
      }
    );

    onClose();
    setTimeout(() => setIsCartOpen(true), 200);
  };

  if (!product) return null;

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
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
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

            {/* Left Column - Image and Product Info */}
            <div className={styles.modalLeftColumn}>
              <div className={styles.modalImage}>
                {product.imageUrl ? (
                  <img src={product.imageUrl} alt={product.name} />
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

              {/* Product Info - Below Image on PC: Title and Description only */}
              <div className={styles.modalProductInfo}>
                <h2 className={styles.modalName}>{product.name}</h2>
                {product.description && (
                  <div className={styles.modalDescriptionWrapper}>
                    <p className={styles.modalDescription}>
                      {product.description}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Price, Options and Cart */}
            <div className={styles.modalDetails}>
              {/* Price at top of right column */}
              <p className={styles.modalPrice}>{formatPrice(product.price)}</p>

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

              {/* Color Selection */}
              {product.colors && product.colors.length > 0 && (
                <div className={styles.modalOptions}>
                  <p className={styles.modalOptionLabel}>Color</p>
                  <div className={styles.modalOptionList}>
                    {product.colors.map((color) => (
                      <button
                        key={color}
                        className={`${styles.modalOptionBtn} ${
                          selectedColor === color
                            ? styles.modalOptionBtnActive
                            : ""
                        }`}
                        onClick={() => setSelectedColor(color)}
                      >
                        {color}
                      </button>
                    ))}
                  </div>
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
