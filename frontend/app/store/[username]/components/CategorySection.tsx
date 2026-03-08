"use client";

import React from "react";
import styles from "../store.module.css";
import ProductCardStore, { Product } from "./ProductCardStore";

interface CategorySectionProps {
  categoryName: string;
  products: Product[];
  onProductClick: (product: Product) => void;
}

export default function CategorySection({
  categoryName,
  products,
  onProductClick,
}: CategorySectionProps) {
  if (products.length === 0) return null;

  return (
    <section className={styles.storeSection}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeaderLeft}>
          <h2 className={styles.sectionTitle}>{categoryName}</h2>
        </div>
      </div>

      <div className={styles.sectionDivider} />

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
    </section>
  );
}
