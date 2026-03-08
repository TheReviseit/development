"use client";

import React, { useRef, useState, useEffect } from "react";
import styles from "../store.module.css";
import ProductCardStore, { Product } from "./ProductCardStore";

interface NewArrivalsSectionProps {
  products: Product[];
  onProductClick: (product: Product) => void;
}

export default function NewArrivalsSection({
  products,
  onProductClick,
}: NewArrivalsSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  };

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll, { passive: true });
      window.addEventListener("resize", checkScroll);
      return () => {
        el.removeEventListener("scroll", checkScroll);
        window.removeEventListener("resize", checkScroll);
      };
    }
  }, [products]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.querySelector("div")?.offsetWidth || 300;
    el.scrollBy({
      left: direction === "left" ? -cardWidth - 20 : cardWidth + 20,
      behavior: "smooth",
    });
  };

  if (products.length === 0) return null;

  return (
    <section className={styles.storeSection}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionHeaderLeft}>
          <h2 className={styles.sectionTitle}>New Arrivals</h2>
          <p className={styles.sectionSubtitle}>
            Just dropped — our latest additions
          </p>
        </div>
      </div>

      <div className={styles.arrivalsCarouselWrapper}>
        {canScrollLeft && (
          <button
            className={`${styles.carouselArrow} ${styles.carouselArrowLeft}`}
            onClick={() => scroll("left")}
            aria-label="Scroll left"
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
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        <div className={styles.arrivalsCarousel} ref={scrollRef}>
          {products.map((product, index) => (
            <div key={product.id} className={styles.arrivalsCard}>
              <ProductCardStore
                product={product}
                index={index}
                onClick={() => onProductClick(product)}
              />
            </div>
          ))}
        </div>

        {canScrollRight && (
          <button
            className={`${styles.carouselArrow} ${styles.carouselArrowRight}`}
            onClick={() => scroll("right")}
            aria-label="Scroll right"
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
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}
