"use client";

import React from "react";
import styles from "../booking.module.css";

// ============================================================
// Types
// ============================================================
interface CategoryCount {
  name: string;
  count: number;
}

interface ServiceCategoryNavProps {
  categories: CategoryCount[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  totalServices: number;
}

// ============================================================
// ServiceCategoryNav Component
// ============================================================
export default function ServiceCategoryNav({
  categories,
  activeCategory,
  onCategoryChange,
  totalServices,
}: ServiceCategoryNavProps) {
  return (
    <nav className={styles.categoryNav}>
      <div className={styles.categoryList}>
        {/* All Category */}
        <button
          className={`${styles.categoryPill} ${
            activeCategory === "All" ? styles.categoryPillActive : ""
          }`}
          onClick={() => onCategoryChange("All")}
        >
          All
          <span className={styles.categoryCount}>({totalServices})</span>
        </button>

        {/* Dynamic Categories */}
        {categories.map((cat) => (
          <button
            key={cat.name}
            className={`${styles.categoryPill} ${
              activeCategory === cat.name ? styles.categoryPillActive : ""
            }`}
            onClick={() => onCategoryChange(cat.name)}
          >
            {cat.name}
            <span className={styles.categoryCount}>({cat.count})</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
