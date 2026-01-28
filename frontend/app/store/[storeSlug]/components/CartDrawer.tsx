"use client";

import React, { useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import styles from "../store.module.css";
import { useCart, CartItem } from "../context/CartContext";

// ============================================================================
// TYPES
// ============================================================================

interface CartItemProps {
  item: CartItem;
  onUpdateOptions: (
    itemId: string,
    options: { color?: string; size?: string },
  ) => void;
  onUpdateQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  formatPrice: (price: number) => string;
}

// ============================================================================
// UTILITY FUNCTIONS - Pure functions outside component for stability
// ============================================================================

/**
 * Get available sizes for a specific color from pricing info
 * This is a pure function that doesn't depend on component state
 *
 * Logic:
 * 1. If the color is a BASE PRODUCT color -> return base product sizes only
 * 2. If the color is a VARIANT color -> return sizes from variantSizePrices for that color
 * 3. Fallback to all available sizes
 */
const getAvailableSizesForColor = (
  selectedColor: string,
  pricingInfo: CartItem["pricingInfo"],
  availableSizes: string[] | undefined,
): string[] => {
  if (!pricingInfo) return availableSizes || [];

  // Check if this is a base product color
  const isBaseColor = pricingInfo.baseProductColors?.includes(selectedColor);

  if (isBaseColor) {
    // For base product colors, use base product sizes
    if (
      pricingInfo.baseProductSizes &&
      pricingInfo.baseProductSizes.length > 0
    ) {
      return pricingInfo.baseProductSizes;
    }
    // If no base product sizes defined, return all available sizes
    return availableSizes || [];
  }

  // For variant colors, extract sizes from variantSizePrices
  if (pricingInfo.variantSizePrices) {
    const sizesForColor = new Set<string>();
    Object.keys(pricingInfo.variantSizePrices).forEach((key) => {
      // key format: "color_size"
      const parts = key.split("_");
      if (parts.length >= 2) {
        const color = parts[0];
        const size = parts.slice(1).join("_"); // Handle sizes with underscores
        if (color === selectedColor && size) {
          sizesForColor.add(size);
        }
      }
    });

    if (sizesForColor.size > 0) {
      return Array.from(sizesForColor);
    }
  }

  // Fallback to all available sizes
  return availableSizes || [];
};

// ============================================================================
// MEMOIZED CART ITEM COMPONENT - Defined OUTSIDE main component
// ============================================================================

/**
 * CartItemWithOptions - A memoized component that renders a single cart item
 *
 * Key optimizations:
 * 1. Defined outside CartDrawer to prevent recreation on every render
 * 2. Uses React.memo to prevent unnecessary re-renders
 * 3. Receives callbacks as props instead of closing over context
 * 4. Uses stable animation config without layout prop to prevent re-animation
 */
const CartItemWithOptions = memo(function CartItemWithOptions({
  item,
  onUpdateOptions,
  onUpdateQuantity,
  onRemove,
  formatPrice,
}: CartItemProps) {
  const currentColor = item.options?.color || "";
  const availableSizesForColor = getAvailableSizesForColor(
    currentColor,
    item.pricingInfo,
    item.availableSizes,
  );

  // Handle color change - update both color and reset size to first available
  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newColor = e.target.value;
      const newAvailableSizes = getAvailableSizesForColor(
        newColor,
        item.pricingInfo,
        item.availableSizes,
      );
      const firstSize = newAvailableSizes[0] || item.options?.size || "";

      onUpdateOptions(item.id, {
        color: newColor,
        size: firstSize,
      });
    },
    [
      item.id,
      item.pricingInfo,
      item.availableSizes,
      item.options?.size,
      onUpdateOptions,
    ],
  );

  // Handle size change
  const handleSizeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onUpdateOptions(item.id, {
        size: e.target.value,
      });
    },
    [item.id, onUpdateOptions],
  );

  // Quantity handlers
  const handleDecrement = useCallback(() => {
    onUpdateQuantity(item.id, item.quantity - 1);
  }, [item.id, item.quantity, onUpdateQuantity]);

  const handleIncrement = useCallback(() => {
    onUpdateQuantity(item.id, item.quantity + 1);
  }, [item.id, item.quantity, onUpdateQuantity]);

  const handleRemove = useCallback(() => {
    onRemove(item.id);
  }, [item.id, onRemove]);

  return (
    <motion.div
      className={styles.cartItem}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      // Using layoutId instead of layout prop to prevent full re-animation
      // on option changes while still animating position changes
      layoutId={`cart-item-${item.productId}`}
    >
      <div className={styles.cartItemImage}>
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} loading="lazy" />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              fontSize: "32px",
              opacity: 0.3,
            }}
          >
            📦
          </div>
        )}
      </div>

      <div className={styles.cartItemDetails}>
        <h4 className={styles.cartItemName}>{item.name}</h4>

        {/* Show dropdowns for items added from dashboard - only if there are multiple options */}
        {item.addedFromDashboard &&
        ((item.availableColors && item.availableColors.length > 1) ||
          availableSizesForColor.length > 1) ? (
          <div className={styles.cartItemOptionsDropdowns}>
            {/* Color dropdown - only show if more than 1 color */}
            {item.availableColors && item.availableColors.length > 1 && (
              <div className={styles.cartOptionSelector}>
                <label htmlFor={`color-${item.id}`}>Color:</label>
                <select
                  id={`color-${item.id}`}
                  value={item.options?.color || ""}
                  onChange={handleColorChange}
                  className={styles.cartOptionSelect}
                >
                  {item.availableColors.map((color: string) => (
                    <option key={color} value={color}>
                      {color}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Size dropdown - only show if more than 1 size for current color */}
            {availableSizesForColor.length > 1 && (
              <div className={styles.cartOptionSelector}>
                <label htmlFor={`size-${item.id}`}>Size:</label>
                <select
                  id={`size-${item.id}`}
                  value={item.options?.size || ""}
                  onChange={handleSizeChange}
                  className={styles.cartOptionSelect}
                >
                  {availableSizesForColor.map((size: string) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        ) : (
          /* Show static options for items added from product detail OR single option items */
          (item.options?.size || item.options?.color) && (
            <div className={styles.cartItemOptions}>
              {item.options.color && <span>Color: {item.options.color}</span>}
              {item.options.size && <span>Size: {item.options.size}</span>}
            </div>
          )
        )}

        <p className={styles.cartItemPrice}>
          {formatPrice(item.price * item.quantity)}
        </p>

        <div className={styles.cartItemActions}>
          <div className={styles.quantityControl}>
            <button
              className={styles.quantityBtn}
              onClick={handleDecrement}
              aria-label="Decrease quantity"
              type="button"
            >
              −
            </button>
            <span className={styles.quantityValue}>{item.quantity}</span>
            <button
              className={styles.quantityBtn}
              onClick={handleIncrement}
              aria-label="Increase quantity"
              type="button"
            >
              +
            </button>
          </div>

          <button
            className={styles.removeItemBtn}
            onClick={handleRemove}
            aria-label="Remove item"
            type="button"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
});

// ============================================================================
// MAIN CART DRAWER COMPONENT
// ============================================================================

export default function CartDrawer() {
  const params = useParams();
  const router = useRouter();
  const storeSlug = params?.storeSlug as string;

  const {
    cartItems,
    removeFromCart,
    updateQuantity,
    updateItemOptions,
    cartTotal,
    isCartOpen,
    setIsCartOpen,
  } = useCart();

  // Lock body scroll when cart is open
  useEffect(() => {
    if (isCartOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isCartOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isCartOpen) {
        setIsCartOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isCartOpen, setIsCartOpen]);

  // Memoized format function to prevent recreation
  const formatPrice = useCallback((price: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);
  }, []);

  // Memoized checkout handler
  const handleCheckout = useCallback(() => {
    setIsCartOpen(false);
    router.push(`/store/${storeSlug}/checkout`);
  }, [setIsCartOpen, router, storeSlug]);

  // Memoized close handler
  const handleClose = useCallback(() => {
    setIsCartOpen(false);
  }, [setIsCartOpen]);

  return (
    <>
      {/* Overlay */}
      <div
        className={`${styles.cartOverlay} ${
          isCartOpen ? styles.cartOverlayVisible : ""
        }`}
        onClick={handleClose}
        role="presentation"
      />

      {/* Drawer */}
      <aside
        className={`${styles.cartDrawer} ${
          isCartOpen ? styles.cartDrawerOpen : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
      >
        <div className={styles.cartHeader}>
          <h2 className={styles.cartTitle}>Your Cart</h2>
          <button
            className={styles.cartCloseBtn}
            onClick={handleClose}
            aria-label="Close cart"
            type="button"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.cartItems}>
          {cartItems.length === 0 ? (
            <div className={styles.cartEmpty}>
              <img
                src="/icons/cart.svg"
                alt="Empty cart"
                className={styles.cartEmptyIcon}
              />
              <p className={styles.cartEmptyText}>Your cart is empty</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {cartItems.map((item) => (
                <CartItemWithOptions
                  key={item.productId}
                  item={item}
                  onUpdateOptions={updateItemOptions}
                  onUpdateQuantity={updateQuantity}
                  onRemove={removeFromCart}
                  formatPrice={formatPrice}
                />
              ))}
            </AnimatePresence>
          )}
        </div>

        {cartItems.length > 0 && (
          <div className={styles.cartFooter}>
            <div className={styles.cartTotal}>
              <span className={styles.cartTotalLabel}>Subtotal</span>
              <span className={styles.cartTotalValue}>
                {formatPrice(cartTotal)}
              </span>
            </div>
            <button
              className={styles.checkoutBtn}
              onClick={handleCheckout}
              type="button"
            >
              Buy Now — {formatPrice(cartTotal)}
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
