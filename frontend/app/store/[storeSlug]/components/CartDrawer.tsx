"use client";

import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "../store.module.css";
import { useCart } from "../context/CartContext";

export default function CartDrawer() {
  const {
    cartItems,
    removeFromCart,
    updateQuantity,
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

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);
  };

  const handleWhatsAppOrder = () => {
    if (cartItems.length === 0) return;

    const orderLines = cartItems.map(
      (item) =>
        `• ${item.name}${item.options?.size ? ` (${item.options.size})` : ""}${
          item.options?.color ? ` - ${item.options.color}` : ""
        } x${item.quantity} = ${formatPrice(item.price * item.quantity)}`
    );

    const message = `🛒 *New Order Request*\n\n${orderLines.join(
      "\n"
    )}\n\n*Total: ${formatPrice(cartTotal)}*\n\nPlease confirm my order!`;

    // This would use the store's WhatsApp number - for now open blank
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, "_blank");
  };

  return (
    <>
      {/* Overlay */}
      <div
        className={`${styles.cartOverlay} ${
          isCartOpen ? styles.cartOverlayVisible : ""
        }`}
        onClick={() => setIsCartOpen(false)}
      />

      {/* Drawer */}
      <aside
        className={`${styles.cartDrawer} ${
          isCartOpen ? styles.cartDrawerOpen : ""
        }`}
      >
        <div className={styles.cartHeader}>
          <h2 className={styles.cartTitle}>Your Cart</h2>
          <button
            className={styles.cartCloseBtn}
            onClick={() => setIsCartOpen(false)}
            aria-label="Close cart"
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
              <div className={styles.cartEmptyIcon}>🛒</div>
              <p className={styles.cartEmptyText}>Your cart is empty</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {cartItems.map((item) => (
                <motion.div
                  key={item.id}
                  className={styles.cartItem}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  layout
                >
                  <div className={styles.cartItemImage}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} />
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
                    {(item.options?.size || item.options?.color) && (
                      <p className={styles.cartItemOptions}>
                        {item.options.size && `Size: ${item.options.size}`}
                        {item.options.size && item.options.color && " • "}
                        {item.options.color && `Color: ${item.options.color}`}
                      </p>
                    )}
                    <p className={styles.cartItemPrice}>
                      {formatPrice(item.price * item.quantity)}
                    </p>

                    <div className={styles.cartItemActions}>
                      <div className={styles.quantityControl}>
                        <button
                          className={styles.quantityBtn}
                          onClick={() =>
                            updateQuantity(item.id, item.quantity - 1)
                          }
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span className={styles.quantityValue}>
                          {item.quantity}
                        </span>
                        <button
                          className={styles.quantityBtn}
                          onClick={() =>
                            updateQuantity(item.id, item.quantity + 1)
                          }
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>

                      <button
                        className={styles.removeItemBtn}
                        onClick={() => removeFromCart(item.id)}
                        aria-label="Remove item"
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
              onClick={handleWhatsAppOrder}
            >
              Order via WhatsApp
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
