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
      // Handle colors as both string and array
      const firstColor = Array.isArray(product.colors)
        ? product.colors[0]
        : product.colors;
      setSelectedColor(firstColor || null);

      // Set first available size based on first color
      if (firstColor && product.variants && product.variants.length > 0) {
        const availableSizes = getAvailableSizesForColor(firstColor);
        setSelectedSize(availableSizes[0] || null);
      } else {
        setSelectedSize(product.sizes?.[0] || null);
      }

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

  // Get available sizes for selected color from variants
  const getAvailableSizesForColor = (color: string): string[] => {
    // If no variants, use product.sizes
    if (!product?.variants || product.variants.length === 0) {
      console.log("No variants, using product.sizes:", product?.sizes);
      return product?.sizes || [];
    }

    const sizesSet = new Set<string>();
    product.variants.forEach((variant) => {
      if (variant.color === color) {
        if (Array.isArray(variant.size)) {
          variant.size.forEach((s) => sizesSet.add(s));
        } else if (typeof variant.size === "string" && variant.size) {
          // Handle comma-separated size strings (e.g., "XXL, XL")
          const sizes = variant.size
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          sizes.forEach((s) => sizesSet.add(s));
        }
      }
    });

    const variantSizes = Array.from(sizesSet);

    // If no sizes found for this color in variants, fall back to product.sizes
    if (variantSizes.length === 0) {
      console.log(
        `No variant found for color "${color}", using product.sizes:`,
        product?.sizes,
      );
      return product?.sizes || [];
    }

    console.log(`Sizes for color "${color}":`, variantSizes);
    return variantSizes;
  };

  // Get available sizes based on selected color
  const availableSizes = selectedColor
    ? getAvailableSizesForColor(selectedColor)
    : product?.sizes || [];

  // Update selected size when color changes
  useEffect(() => {
    if (selectedColor && product?.variants && product.variants.length > 0) {
      const sizes = getAvailableSizesForColor(selectedColor);
      // If current selected size is not available for this color, select first available
      if (!sizes.includes(selectedSize || "")) {
        setSelectedSize(sizes[0] || null);
      }
    }
  }, [selectedColor]);

  // Get all available colors from variants AND product.colors combined
  const getAvailableColors = (): string[] => {
    console.log("Getting available colors...");
    console.log("Product:", product);
    console.log("Product variants:", product?.variants);
    console.log("Product colors:", product?.colors);

    const colorsSet = new Set<string>();

    // Add colors from product.colors field
    if (product?.colors) {
      const productColors = Array.isArray(product.colors)
        ? product.colors
        : [product.colors];
      productColors.forEach((color) => {
        if (color) colorsSet.add(color);
      });
      console.log("Added colors from product.colors:", productColors);
    }

    // Add colors from variants
    if (product?.variants && product.variants.length > 0) {
      product.variants.forEach((variant) => {
        console.log("Processing variant:", variant);
        if (variant.color) {
          colorsSet.add(variant.color);
        }
      });
      console.log("Added colors from variants");
    }

    const colors = Array.from(colorsSet);
    console.log("Final combined colors:", colors);
    return colors;
  };

  // Get all available colors
  const availableColors = getAvailableColors();
  console.log("Available colors to display:", availableColors);

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
        price: displayPrice,
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

  // Get image for selected color - check multiple sources
  const getImageForColor = (color: string | null): string | undefined => {
    if (!color) return product.imageUrl;

    console.log(`Getting image for color: ${color}`);

    // 1. Check variantImages object (legacy format)
    if (product.variantImages?.[color]?.imageUrl) {
      console.log(
        "Found image in variantImages:",
        product.variantImages[color].imageUrl,
      );
      return product.variantImages[color].imageUrl;
    }

    // 2. Check variants array for matching color
    if (product.variants && product.variants.length > 0) {
      const matchingVariant = product.variants.find((v) => v.color === color);
      if (matchingVariant?.imageUrl) {
        console.log("Found image in variant:", matchingVariant.imageUrl);
        return matchingVariant.imageUrl;
      }
    }

    // 3. Fall back to main product image
    console.log("No variant image found, using main product image");
    return product.imageUrl;
  };

  // Get price for selected size/variant
  const getPriceForVariant = (): number => {
    // Priority 1: Check variant-level size pricing (variant with hasSizePricing + sizePrices)
    if (selectedColor && product.variants && product.variants.length > 0) {
      // Find variant matching selected color
      const matchingVariant = product.variants.find((v) => {
        const colorMatches = v.color === selectedColor;
        // If size is selected and variant has size, check if it matches
        if (selectedSize && v.size) {
          const variantSizes = Array.isArray(v.size)
            ? v.size
            : typeof v.size === "string"
              ? v.size.split(",").map((s) => s.trim())
              : [];
          return colorMatches && variantSizes.includes(selectedSize);
        }
        // Otherwise just match by color
        return colorMatches;
      });

      if (matchingVariant) {
        // Check if this variant has size-based pricing
        if (
          matchingVariant.hasSizePricing &&
          matchingVariant.sizePrices &&
          selectedSize
        ) {
          const sizePrice = matchingVariant.sizePrices[selectedSize];
          if (sizePrice !== undefined && sizePrice > 0) {
            console.log(
              `[VariantSizePricing] Price for ${selectedColor} / ${selectedSize}:`,
              sizePrice,
            );
            return sizePrice;
          }
        }

        // Otherwise use variant's base price
        if (matchingVariant.price && matchingVariant.price > 0) {
          console.log(
            `[VariantPricing] Price for ${selectedColor}${selectedSize ? ` / ${selectedSize}` : ""}:`,
            matchingVariant.price,
          );
          return matchingVariant.price;
        }
      }
    }

    // Priority 2: Check product-level sizePrices (size-based pricing without variants)
    if (product.hasSizePricing && product.sizePrices && selectedSize) {
      const sizePrice = product.sizePrices[selectedSize];
      if (sizePrice !== undefined && sizePrice > 0) {
        console.log(
          `[ProductSizePricing] Price for size "${selectedSize}":`,
          sizePrice,
        );
        return sizePrice;
      }
    }

    // Fallback: Use compareAtPrice as selling price if available (Offer Price), otherwise base price
    if (product.compareAtPrice && product.compareAtPrice > 0) {
      return product.compareAtPrice;
    }
    return product.price;
  };

  const displayImageUrl = getImageForColor(selectedColor);
  const displayPrice = getPriceForVariant();

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
              <div
                className={styles.novaPriceContainer}
                style={{ marginBottom: "16px" }}
              >
                {product.compareAtPrice && product.compareAtPrice > 0 ? (
                  <>
                    <span
                      className={styles.modalPrice}
                      style={{ margin: 0, fontSize: "24px" }}
                    >
                      {formatPrice(displayPrice)}
                    </span>
                    <span
                      className={styles.novaOriginalPrice}
                      style={{ fontSize: "16px" }}
                    >
                      {formatPrice(product.price)}
                    </span>
                  </>
                ) : (
                  <p className={styles.modalPrice}>
                    {formatPrice(displayPrice)}
                  </p>
                )}
              </div>

              {/* Description - visible on mobile (hidden on desktop via CSS) */}
              {product.description && (
                <p className={styles.modalDescriptionMobile}>
                  {product.description}
                </p>
              )}

              {/* Color Selection - Visual Swatches - MOVED UP */}
              {availableColors && availableColors.length > 0 && (
                <div className={styles.modalOptions}>
                  <p className={styles.modalOptionLabel}>Color</p>
                  <div className={styles.modalColorSwatches}>
                    {availableColors.map((color) => {
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

              {/* Size Selection - MOVED DOWN */}
              {availableSizes && availableSizes.length > 0 && (
                <div className={styles.modalOptions}>
                  <p className={styles.modalOptionLabel}>Size</p>
                  <div className={styles.modalOptionList}>
                    {availableSizes.map((size) => (
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
                Add to Cart — {formatPrice(displayPrice * quantity)}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
