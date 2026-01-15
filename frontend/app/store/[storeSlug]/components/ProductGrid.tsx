"use client";

import React from "react";
import styles from "../store.module.css";
import ProductCardStore, { Product } from "./ProductCardStore";

interface ProductGridProps {
  products: Product[];
  onProductClick: (product: Product) => void;
}

export default function ProductGrid({
  products,
  onProductClick,
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className={styles.productGrid}>
        <div className={styles.productGridEmpty}>
          <div className={styles.emptyIcon}>🔍</div>
          <h3 className={styles.emptyTitle}>No products found</h3>
          <p className={styles.emptyText}>
            Try selecting a different category or search term
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.productGrid}>
      {products.map((product, index) => (
        <ProductCardStore
          key={product.id}
          product={product}
          index={index}
          onClick={() => onProductClick(product)}
        />
      ))}
    </div>
  );
}
