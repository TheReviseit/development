"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import styles from "../store.module.css";
import { useCart } from "../context/CartContext";

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  rating?: number;
  reviewCount?: number;
  description?: string;
  imageUrl?: string;
  sizes?: string[];
  colors?: string[];
  available?: boolean;
  variantImages?: Record<string, { imageUrl: string; imagePublicId: string }>;
  badge?: "new" | "premium" | "bestseller" | "hot" | null;
  isWishlisted?: boolean;
}

interface ProductCardStoreProps {
  product: Product;
  onClick: () => void;
  index: number;
  onAddToCart?: (e: React.MouseEvent) => void;
  onBuyNow?: (e: React.MouseEvent) => void;
  onWishlistToggle?: (productId: string) => void;
}

export default function ProductCardStore({
  product,
  onClick,
  index,
  onAddToCart,
  onBuyNow,
  onWishlistToggle,
}: ProductCardStoreProps) {
  const { cartItems, addToCart, updateQuantity, removeFromCart } = useCart();
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isWishlisted, setIsWishlisted] = useState(
    product.isWishlisted || false,
  );

  // Get quantity from cart
  const cartItem = cartItems.find((item) => item.productId === product.id);
  const quantityInCart = cartItem?.quantity || 0;

  // Simulate initial loading for skeleton effect
  useEffect(() => {
    const timer = setTimeout(
      () => {
        setIsLoading(false);
      },
      600 + index * 80,
    );
    return () => clearTimeout(timer);
  }, [index]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const truncateDescription = (desc: string, maxLength: number = 50) => {
    if (desc.length <= maxLength) return desc;
    return desc.substring(0, maxLength).trim() + "...";
  };

  const rating = product.rating || 4.5;
  const reviewCount = product.reviewCount;
  const description = product.description || "";
  const colors = product.colors || [];

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    addToCart({
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
    });
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cartItem) {
      updateQuantity(cartItem.id, quantityInCart + 1);
    }
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (cartItem && quantityInCart > 1) {
      updateQuantity(cartItem.id, quantityInCart - 1);
    } else if (cartItem) {
      removeFromCart(cartItem.id);
    }
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (quantityInCart === 0) {
      addToCart({
        id: product.id,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
      });
    }
    // Could open cart or redirect to checkout here
  };

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsWishlisted(!isWishlisted);
    if (onWishlistToggle) {
      onWishlistToggle(product.id);
    }
  };

  // Color mapping for swatches
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
      navy: "#1e3a5f",
      brown: "#8b5a2b",
      beige: "#d4b896",
      gold: "#ffd700",
      silver: "#c0c0c0",
    };
    return colorMap[colorName.toLowerCase()] || "#6b7280";
  };

  // Skeleton Loading State
  if (isLoading) {
    return (
      <motion.article
        className={styles.novaCard}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.4,
          delay: index * 0.05,
          ease: [0.25, 0.1, 0.25, 1],
        }}
      >
        {/* Skeleton Image */}
        <div className={styles.novaImageContainer}>
          <div className={styles.skeletonImage}>
            <div className={styles.skeletonShimmer} />
          </div>
        </div>

        {/* Skeleton Content */}
        <div className={styles.novaContent}>
          <div className={styles.skeletonTitle}>
            <div className={styles.skeletonShimmer} />
          </div>
          <div className={styles.skeletonDescription}>
            <div className={styles.skeletonShimmer} />
          </div>
          <div className={styles.skeletonPriceRow}>
            <div className={styles.skeletonPrice}>
              <div className={styles.skeletonShimmer} />
            </div>
            <div className={styles.skeletonColors}>
              <div className={styles.skeletonShimmer} />
            </div>
          </div>
          <div className={styles.skeletonBuyBtn}>
            <div className={styles.skeletonShimmer} />
          </div>
          <div className={styles.skeletonCartBtn}>
            <div className={styles.skeletonShimmer} />
          </div>
        </div>
      </motion.article>
    );
  }

  return (
    <motion.article
      className={styles.novaCard}
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.05,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      whileHover={{ y: -4 }}
    >
      {/* Image Container - Light gray background */}
      <div className={styles.novaImageContainer}>
        {/* Skeleton Loading for Image */}
        {!isImageLoaded && product.imageUrl && (
          <div className={styles.skeletonImage}>
            <div className={styles.skeletonShimmer} />
          </div>
        )}

        {/* Product Image */}
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className={`${styles.novaImage} ${
              isImageLoaded ? styles.novaImageLoaded : ""
            }`}
            loading="lazy"
            onLoad={() => setIsImageLoaded(true)}
            onError={() => setIsImageLoaded(true)}
          />
        ) : (
          <div className={styles.novaImagePlaceholder}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}
      </div>

      {/* Content Section */}
      <div className={styles.novaContent}>
        {/* Product Title */}
        <h3 className={styles.novaTitle}>{product.name}</h3>

        {/* Description */}
        {description && (
          <p className={styles.novaDescription}>
            {truncateDescription(description)}
          </p>
        )}

        {/* Price Row with Rating on right */}
        <div className={styles.novaPriceRow}>
          <span className={styles.novaPrice}>{formatPrice(product.price)}</span>

          {/* Rating on right side */}
          <div className={styles.novaRating}>
            <svg
              className={styles.novaHeartIcon}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
            <span className={styles.novaRatingValue}>{rating.toFixed(1)}</span>
          </div>
        </div>

        {/* Buttons Row - Cart/Qty left, Buy Now right (stacked on mobile when in cart) */}
        <div
          className={`${styles.novaButtonsRow} ${
            quantityInCart > 0 ? styles.novaButtonsRowStacked : ""
          }`}
        >
          {quantityInCart === 0 ? (
            <motion.button
              className={styles.novaCartIconBtn}
              onClick={handleAddToCart}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Add to cart"
            >
              <img
                src="/icons/cart.svg"
                alt="Cart"
                className={styles.cartIcon}
              />
            </motion.button>
          ) : (
            <div className={styles.quantityControls}>
              <motion.button
                className={styles.quantityBtn}
                onClick={handleDecrement}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label="Decrease quantity"
              >
                −
              </motion.button>
              <span className={styles.quantityValue}>{quantityInCart}</span>
              <motion.button
                className={styles.quantityBtn}
                onClick={handleIncrement}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                aria-label="Increase quantity"
              >
                +
              </motion.button>
            </div>
          )}

          <motion.button
            className={styles.novaBuyNowBtn}
            onClick={handleBuyNow}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Buy Now
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
}
