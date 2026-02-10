"use client";

import React, { useState, useEffect, use } from "react";
import { motion } from "framer-motion";
import styles from "../../page.module.css"; // Reuse existing styles
import { ConfigurableCard } from "../../../../dashboard/showcase/settings/ConfigurableCard";
import {
  PresentationConfig,
  ShowcaseItem,
} from "../../../../dashboard/showcase/settings/config.schema";
import ShowcaseHeader from "../../components/ShowcaseHeader";
import { ShowcaseFooter } from "../../components/ShowcaseFooter";
import ShowcaseSearchOverlay from "../../components/ShowcaseSearchOverlay";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ShowcaseData {
  businessName: string;
  logoUrl?: string;
  canonicalSlug?: string; // ✅ Canonical URL slug for navigation
  settings: {
    version: number;
    presentation: PresentationConfig;
    contentType: string;
  };
  items: ShowcaseItem[];
  contact?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  socialMedia?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
  };
}

interface PageProps {
  params: Promise<{
    username: string;
    itemId: string; // Updated to itemId to match route
  }>;
}

export default function ProductPage({ params }: PageProps) {
  const { username, itemId } = use(params);
  const router = useRouter();
  const [data, setData] = useState<ShowcaseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    async function fetchShowcase() {
      try {
        const response = await fetch(`/api/showcase/${username}`);

        if (!response.ok) {
          throw new Error(
            `Failed to load showcase: ${response.status} ${response.statusText}`,
          );
        }

        const result = await response.json();

        if (result.success) {
          setData(result.data);
        } else {
          throw new Error(result.error || "Failed to load showcase");
        }
      } catch (err) {
        console.error("Error fetching showcase:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load showcase",
        );
      } finally {
        setIsLoading(false);
      }
    }

    fetchShowcase();
  }, [username]);

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.error}>
        <h1>Product not found</h1>
        <p>{error || "This product does not exist."}</p>
        <Link href={`/showcase/${username}`} className={styles.backLink}>
          Return to Showcase
        </Link>
      </div>
    );
  }

  // ✅ Use canonical slug for navigation (fallback to username)
  const slug = data.canonicalSlug || username;

  const item = data.items.find((i) => i.id === itemId);
  const otherItems = data.items.filter((i) => i.id !== itemId).slice(0, 4); // Limit to 4 suggestions

  if (!item) {
    return (
      <div className={styles.error}>
        <h1>Product not found</h1>
        <p>The product you are looking for isn't here.</p>
        <Link href={`/showcase/${slug}`} className={styles.backLink}>
          Return to Showcase
        </Link>
      </div>
    );
  }

  const { fields, actions } = data.settings.presentation;

  function handleOrder() {
    router.push(`/showcase/${slug}/checkout/${item?.id}`);
  }

  function handleBooking() {
    router.push(`/showcase/${slug}/view/${itemId}/booking`);
  }

  const config = data.settings.presentation;

  return (
    <div className={styles.page}>
      {/* Header */}
      <ShowcaseHeader
        businessName={data.businessName}
        logoUrl={data.logoUrl}
        onSearchClick={() => setIsSearchOpen(true)}
      />

      <main className={styles.main}>
        <div className={styles.container}>
          {/* Back Link */}
          <Link href={`/showcase/${slug}`} className={styles.breadcrumbLink}>
            ← Back to Gallery
          </Link>

          {/* Product Split View */}
          <div className={styles.productSplitView}>
            {/* Left: Image */}
            <div className={styles.productImageSection}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className={styles.productImageContainer}
              >
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className={styles.productMainImage}
                />
              </motion.div>
            </div>

            {/* Right: Content */}
            <div className={styles.productDetailsSection}>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              >
                <h1 className={styles.productTitle}>{item.title}</h1>

                {/* Star Rating - Added as requested */}
                <div className={styles.starRating}>
                  {[1, 2, 3, 4].map((star) => (
                    <svg
                      key={star}
                      className={styles.star}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                  {/* Half Star for > 4 rating effect */}
                  <svg
                    className={styles.star}
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <defs>
                      <linearGradient id="half-star">
                        <stop offset="70%" stopColor="currentColor" />
                        <stop offset="70%" stopColor="#e2e8f0" />
                      </linearGradient>
                    </defs>
                    <path
                      fill="url(#half-star)"
                      d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                    />
                  </svg>
                  <span className={styles.ratingText}>4.7 (128 reviews)</span>
                </div>

                {item.subtitle && (
                  <p className={styles.productSubtitle}>{item.subtitle}</p>
                )}

                {/* Price */}
                {fields.price?.visible && item.price !== undefined && (
                  <div className={styles.productPriceGroup}>
                    <span className={styles.productPrice}>
                      ₹{item.price.toLocaleString()}
                    </span>
                    {item.compareAtPrice &&
                      item.compareAtPrice > item.price && (
                        <span className={styles.productOldPrice}>
                          ₹{item.compareAtPrice.toLocaleString()}
                        </span>
                      )}
                  </div>
                )}

                {/* Stock Status */}
                {fields.stock?.visible && item.stockStatus && (
                  <div className={styles.productStatusBadge}>
                    {item.stockStatus === "in_stock" && (
                      <span className={styles.inStock}>✓ In Stock</span>
                    )}
                    {item.stockStatus === "out_of_stock" && (
                      <span className={styles.outOfStock}>Out of Stock</span>
                    )}
                    {item.stockStatus === "low_stock" && (
                      <span className={styles.lowStock}>⚠ Low Stock</span>
                    )}
                  </div>
                )}

                <div className={styles.divider} />

                {/* Description */}
                {fields.description?.visible && item.description && (
                  <div className={styles.productDescription}>
                    <p>{item.description}</p>
                  </div>
                )}

                {/* Colors */}
                {fields.colors?.visible &&
                  item.colors &&
                  item.colors.length > 0 && (
                    <div className={styles.optionGroup}>
                      <label>Available Colors</label>
                      <div className={styles.colorSwatches}>
                        {item.colors.map((color) => (
                          <span key={color} className={styles.colorSwatch}>
                            {color}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Sizes */}
                {fields.sizes?.visible &&
                  item.sizes &&
                  item.sizes.length > 0 && (
                    <div className={styles.optionGroup}>
                      <label>Available Sizes</label>
                      <div className={styles.sizeOptions}>
                        {item.sizes.map((size) => (
                          <span key={size} className={styles.sizeTag}>
                            {size}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Actions */}
                {(actions.order?.enabled || actions.book?.enabled) && (
                  <div className={styles.productActions}>
                    {actions.order?.enabled && (
                      <button
                        className={styles.orderButtonLarge}
                        onClick={handleOrder}
                      >
                        {actions.order.label || "Order Now"}
                      </button>
                    )}
                    {actions.book?.enabled && (
                      <button
                        className={styles.bookButtonLarge}
                        onClick={handleBooking}
                      >
                        {actions.book.label || "Book Now"}
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            </div>
          </div>

          {/* Other Suggestions */}
          <div className={styles.suggestionsSection}>
            <h2 className={styles.suggestionsTitle}>You might also like</h2>
            {otherItems.length > 0 ? (
              <div className={styles.grid}>
                {otherItems.map((otherItem) => (
                  <ConfigurableCard
                    key={otherItem.id}
                    item={otherItem}
                    config={config}
                    onClick={() =>
                      router.push(`/showcase/${slug}/view/${otherItem.id}`)
                    }
                    onOrderClick={() =>
                      router.push(`/showcase/${slug}/checkout/${otherItem.id}`)
                    }
                    onBookClick={() =>
                      router.push(
                        `/showcase/${slug}/view/${otherItem.id}/booking`,
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <p className={styles.empty}>
                More from this collection coming soon.
              </p>
            )}
          </div>
        </div>
      </main>

      <ShowcaseFooter
        businessName={data.businessName}
        logoUrl={data.logoUrl}
        contact={data.contact}
        socialMedia={data.socialMedia}
      />

      <ShowcaseSearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        items={data.items}
        onItemClick={(item) => {
          setIsSearchOpen(false);
          router.push(`/showcase/${slug}/view/${item.id}`);
        }}
        config={data.settings.presentation}
      />
    </div>
  );
}
