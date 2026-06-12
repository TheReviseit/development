/**
 * ConfigurableCard Component (Updated to Nova Design - Header Layout)
 *
 * CRITICAL: This is the SAME component used in:
 * - Preview pane (with mock data)
 * - Public showcase page (with real data)
 *
 * This guarantees zero mismatch between preview and production.
 */

"use client";

import React, { useState } from "react";
import styles from "./ConfigurableCard.module.css";
import { PresentationConfig, ShowcaseItem } from "../settings/config.schema";

interface ConfigurableCardProps {
  item: ShowcaseItem;
  config: PresentationConfig;
  isLoading?: boolean;
  index?: number;
  onClick?: () => void;
  onOrderClick?: () => void;
  onBookClick?: () => void;
}

export function ConfigurableCard({
  item,
  config,
  isLoading: propLoading,
  index = 0,
  onClick,
  onOrderClick,
  onBookClick,
}: ConfigurableCardProps) {
  const { fields, actions } = config;
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const [internalLoading, setInternalLoading] = React.useState(true);

  // Staggered entrance animation/skeleton
  React.useEffect(() => {
    const timer = setTimeout(
      () => {
        setInternalLoading(false);
      },
      400 + index * 60,
    );
    return () => clearTimeout(timer);
  }, [index]);

  const isLoading = propLoading || internalLoading;

  if (isLoading) {
    return (
      <div className={styles.card}>
        <div className={styles.imageFrame}>
          <div className={styles.skeletonImage}>
            <div className={styles.skeletonShimmer} />
          </div>
        </div>
        <div className={styles.content}>
          <div className={styles.headerRow}>
            <div className={styles.skeletonTitle}>
              <div className={styles.skeletonShimmer} />
            </div>
            <div className={styles.skeletonPrice}>
              <div className={styles.skeletonShimmer} />
            </div>
          </div>
          <div className={styles.skeletonSubtitle}>
            <div className={styles.skeletonShimmer} />
          </div>
          <div className={styles.skeletonDescription}>
            <div className={styles.skeletonShimmer} />
          </div>
          <div className={styles.actions}>
            <div className={styles.skeletonAction}>
              <div className={styles.skeletonShimmer} />
            </div>
            <div className={styles.skeletonAction}>
              <div className={styles.skeletonShimmer} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card} onClick={onClick}>
      {/* Image Container - Nova Style (1:1 Aspect Ratio) */}
      <div className={styles.imageFrame}>
        <img
          src={item.imageUrl}
          alt={item.title}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          style={{ opacity: imageLoaded ? 1 : 0 }}
        />
        {!imageLoaded && (
          <div className={styles.skeletonImage}>
            <div className={styles.skeletonShimmer} />
          </div>
        )}
        {item.isFeatured && (
          <div className={styles.featuredBadge}>Featured</div>
        )}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {/* Header Row: Title (Left) + Price (Right) */}
        <div className={styles.headerRow}>
          <h3 className={styles.title} title={item.title}>
            {item.title}
          </h3>

          {/* Price - Moved here, near the name */}
          {fields.price?.visible &&
            item.price !== undefined &&
            item.price !== null && (
              <div className={styles.priceContainer}>
                <span className={styles.price}>
                  ₹{item.price.toLocaleString()}
                </span>
                {item.compareAtPrice !== undefined &&
                  item.compareAtPrice !== null &&
                  item.compareAtPrice > item.price && (
                    <span className={styles.oldPrice}>
                      ₹{item.compareAtPrice.toLocaleString()}
                    </span>
                  )}
              </div>
            )}
        </div>

        {/* Subtitle - If present */}
        {item.subtitle && (
          <p className={styles.subtitle} title={item.subtitle}>
            {item.subtitle}
          </p>
        )}

        {/* Description - Conditional & Truncated */}
        {fields.description?.visible && item.description && (
          <p className={styles.description} title={item.description}>
            {item.description}
          </p>
        )}

        {/* Action Buttons */}
        {(actions.order?.enabled || actions.book?.enabled) && (
          <div className={styles.actions}>
            {actions.order?.enabled && (
              <button
                className={styles.orderButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onOrderClick?.();
                }}
              >
                {actions.order.label || "Order"}
              </button>
            )}

            {actions.book?.enabled && (
              <button
                className={styles.bookButton}
                onClick={(e) => {
                  e.stopPropagation();
                  onBookClick?.();
                }}
              >
                {actions.book.label || "Book"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
