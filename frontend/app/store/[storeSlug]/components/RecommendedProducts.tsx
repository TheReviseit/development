"use client";

import React from "react";
import { motion } from "framer-motion";
import styles from "../store.module.css";
import ProductCardStore, { Product } from "./ProductCardStore";

interface RecommendedProductsProps {
  products: Product[];
  onProductClick: (product: Product) => void;
}

export default function RecommendedProducts({
  products,
  onProductClick,
}: RecommendedProductsProps) {
  // Simple recommendation logic: take first 4 products
  // In a real app, this could filter by "bestseller" flag or popularity
  const recommended = products.slice(0, 4);

  if (recommended.length === 0) return null;

  return (
    <div className={styles.recommendedSection}>
      <h3 className={styles.recommendedTitle}>Recommended for you</h3>
      <div className={styles.searchResultsGrid}>
        {recommended.map((product, index) => (
          <ProductCardStore
            key={product.id}
            product={product}
            index={index}
            onClick={() => onProductClick(product)}
          />
        ))}
      </div>
    </div>
  );
}
