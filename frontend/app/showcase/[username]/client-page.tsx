/**
 * Public Showcase Page (Client Component)
 * Route: /showcase/[username]
 *
 * This is the public-facing showcase page that displays items
 * configured by the business using the same ConfigurableCard component.
 *
 * UPDATED: Uses Premium Nova Design System matching the Store.
 * UPDATED: Navigates to product view page instead of opening modal.
 */

"use client";

import React, { useState, useEffect, use } from "react";
import { motion } from "framer-motion";
import styles from "./page.module.css";
import { ConfigurableCard } from "../../dashboard/showcase/settings/ConfigurableCard";
import {
  PresentationConfig,
  ShowcaseItem,
} from "../../dashboard/showcase/settings/config.schema";
import ShowcaseHeader from "./components/ShowcaseHeader";
import { ShowcaseFooter } from "./components/ShowcaseFooter";
import ShowcaseSearchOverlay from "./components/ShowcaseSearchOverlay";
import ShowcaseCarousel from "./components/ShowcaseCarousel";
import CategoryNav from "./components/CategoryNav";
import { useRouter } from "next/navigation";

interface ShowcaseData {
  businessName: string;
  logoUrl?: string;
  userId?: string;
  canonicalSlug?: string; // ✅ SEO canonical URL slug
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
  }>;
}

export default function ShowcasePage({ params }: PageProps) {
  const { username } = use(params);
  const router = useRouter();
  const [data, setData] = useState<ShowcaseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");

  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchShowcase = React.useCallback(
    async (isRefresh = false) => {
      try {
        if (!isRefresh) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }
        setError(null);

        const response = await fetch(`/api/showcase/${username}`, {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        if (!response.ok) {
          const errorText = await response.json();
          throw new Error(errorText.error || "Failed to load showcase");
        }

        const result = await response.json();

        if (result.success) {
          setData(result.data);
        } else {
          throw new Error(result.error || "Failed to load showcase");
        }
      } catch (err) {
        console.error("Error fetching showcase:", err);
        if (!isRefresh) {
          setError(
            err instanceof Error ? err.message : "Failed to load showcase",
          );
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [username],
  );

  useEffect(() => {
    fetchShowcase(false);
  }, [fetchShowcase]);

  // Real-time sync: Subscribe to updates from Dashboard
  // ✅ ENTERPRISE FIX: Dual-subscription pattern for maximum reliability
  useEffect(() => {
    const { subscribeToStoreUpdates } = require("@/app/utils/storeSync");

    // Extract userId from fetched data for Supabase Realtime subscription
    const userId = data?.userId;

    if (!userId) {
      console.log("[Showcase] ⏳ Waiting for userId from API response...");
      return;
    }

    // CRITICAL: Use userId (Firebase UID) for Supabase Realtime filtering
    // Supabase filters by user_id=eq.${storeId}, which expects Firebase UID
    // BroadcastChannel/localStorage will still use username for same-browser sync
    console.log(
      "[Showcase] 🔄 Subscribing to real-time updates with userId:",
      userId.substring(0, 8) + "...",
    );

    const unsubscribe = subscribeToStoreUpdates(userId, (event: any) => {
      console.log("[Showcase] 📡 Received real-time update:", event.type);
      fetchShowcase(true);
    });

    return () => unsubscribe();
  }, [data?.userId, fetchShowcase]);

  // Derive categories from items
  const categories = React.useMemo(() => {
    if (!data?.items) return [];
    const uniqueCategories = new Set<string>();
    data.items.forEach((item) => {
      // Check both top-level category and metadata.category
      const rawCategory = item.category || (item.metadata as any)?.category;
      if (rawCategory) {
        // Normalize to Title Case or just trim and use original if unique-ish
        // For simplicity, we'll just trim and use a case-insensitive Set logic
        uniqueCategories.add(rawCategory.trim());
      }
    });

    // Final deduplication by case
    const deduplicated = new Map<string, string>();
    uniqueCategories.forEach((cat) => {
      const lower = cat.toLowerCase();
      if (!deduplicated.has(lower)) {
        deduplicated.set(lower, cat); // Keep the first version encountered
      }
    });

    return Array.from(deduplicated.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "accent" }),
    );
  }, [data?.items]);

  // Filter items based on active category
  const filteredItems = React.useMemo(() => {
    if (!data?.items) return [];
    if (activeCategory === "All") return data.items;
    return data.items.filter((item) => {
      const category = item.category || (item.metadata as any)?.category;
      return category?.toLowerCase() === activeCategory.toLowerCase();
    });
  }, [data?.items, activeCategory]);

  // Error state
  if (error && !data) {
    return (
      <div className={styles.error}>
        <h1>Showcase not found</h1>
        <p>{error || "This showcase does not exist or has been removed."}</p>
      </div>
    );
  }

  function handleItemClick(item: ShowcaseItem) {
    // ✅ ENTERPRISE: Use canonical slug from data for consistent URLs
    const slug = data?.canonicalSlug || username;
    router.push(`/showcase/${slug}/view/${item.id}`);
  }

  function handleOrder(item: ShowcaseItem) {
    const slug = data?.canonicalSlug || username;
    router.push(`/showcase/${slug}/checkout/${item.id}`);
  }

  function handleBooking(item: ShowcaseItem) {
    const slug = data?.canonicalSlug || username;
    router.push(`/showcase/${slug}/view/${item.id}/booking`);
  }

  return (
    <div className={styles.page}>
      {/* Real-time Refreshing Indicator */}
      {isRefreshing && (
        <div className={styles.refreshingIndicator}>
          <div className={styles.refreshingSpinner} />
          <span>Syncing changes...</span>
        </div>
      )}

      {/* Header with Logo, Title, and Search */}
      <ShowcaseHeader
        businessName={data?.businessName || "Showcase"}
        logoUrl={data?.logoUrl}
        onSearchClick={() => setIsSearchOpen(true)}
      />

      {/* Carousel */}
      <ShowcaseCarousel />

      <CategoryNav
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      {/* Showcase Grid */}
      <main className={styles.main}>
        <div className={styles.container}>
          {isLoading && !data ? (
            <div className={styles.grid}>
              {[...Array(6)].map((_, i) => (
                <ConfigurableCard
                  key={`skeleton-${i}`}
                  item={{} as any}
                  config={{} as any}
                  isLoading={true}
                />
              ))}
            </div>
          ) : data?.items.length === 0 ? (
            <div className={styles.empty}>
              <p>No items to display yet.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {filteredItems.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  style={{ height: "100%" }}
                >
                  <ConfigurableCard
                    item={item}
                    index={index}
                    config={data!.settings.presentation}
                    onClick={() => handleItemClick(item)}
                    onOrderClick={() => handleOrder(item)}
                    onBookClick={() => handleBooking(item)}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer - updated to black in CSS */}
      <ShowcaseFooter
        businessName={data?.businessName || "Showcase"}
        logoUrl={data?.logoUrl}
        contact={data?.contact}
        socialMedia={data?.socialMedia}
      />

      {/* Search Overlay - Uses ConfigurableCard in Grid */}
      {data && (
        <ShowcaseSearchOverlay
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          items={data.items}
          onItemClick={(item) => {
            setIsSearchOpen(false); // Close search when an item is clicked
            handleItemClick(item);
          }}
          config={data.settings.presentation}
        />
      )}
    </div>
  );
}
