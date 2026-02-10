"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "../store.module.css";
import ProductCardStore, { Product } from "./ProductCardStore";
import RecommendedProducts from "./RecommendedProducts";

interface SearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onProductClick: (product: Product) => void;
}

export default function SearchOverlay({
  isOpen,
  onClose,
  products,
  onProductClick,
}: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Lock body scroll when open
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

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Reset query on close
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  // Filter products based on query
  const filteredProducts = useMemo(() => {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase().trim();
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(lowerQuery) ||
        product.category?.toLowerCase().includes(lowerQuery) ||
        product.description?.toLowerCase().includes(lowerQuery),
    );
  }, [products, query]);

  const handleProductClick = (product: Product) => {
    onClose();
    onProductClick(product);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={`${styles.searchOverlay} ${
            isOpen ? styles.searchOverlayVisible : ""
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className={styles.searchHeader}>
            <div className={styles.searchInputWrapper}>
              <button
                className={styles.searchBackBtn}
                onClick={onClose}
                aria-label="Go back"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M19 12H5" />
                  <path d="M12 19l-7-7 7-7" />
                </svg>
              </button>
              <input
                ref={inputRef}
                type="text"
                className={styles.searchInput}
                placeholder="Search products..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
              <button
                className={styles.inputCloseBtn}
                onClick={onClose}
                aria-label="Close search"
              >
                <svg
                  width="20"
                  height="20"
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
            </div>
          </div>

          <div className={styles.searchResults}>
            {query.trim() === "" ? (
              <RecommendedProducts
                products={products}
                onProductClick={handleProductClick}
              />
            ) : filteredProducts.length === 0 ? (
              <div className={styles.searchEmpty}>
                No products found for "{query}"
              </div>
            ) : (
              <motion.div
                className={styles.searchResultsGrid}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {filteredProducts.map((product, index) => (
                  <ProductCardStore
                    key={product.id}
                    product={product}
                    index={index}
                    onClick={() => handleProductClick(product)}
                  />
                ))}
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
