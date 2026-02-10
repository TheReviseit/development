"use client";

import React from "react";
import styles from "../page.module.css";

interface CategoryNavProps {
  categories: string[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

export default function CategoryNav({
  categories,
  activeCategory,
  onCategoryChange,
}: CategoryNavProps) {
  if (categories.length === 0) return null;

  return (
    <nav className={styles.categoryNav}>
      <div className={styles.categoryList}>
        <button
          className={`${styles.categoryPill} ${
            activeCategory === "All" ? styles.categoryPillActive : ""
          }`}
          onClick={() => onCategoryChange("All")}
        >
          All
        </button>
        {categories.map((category) => (
          <button
            key={category}
            className={`${styles.categoryPill} ${
              activeCategory === category ? styles.categoryPillActive : ""
            }`}
            onClick={() => onCategoryChange(category)}
          >
            {category}
          </button>
        ))}
      </div>
    </nav>
  );
}
