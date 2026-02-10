"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "../page.module.css";
import {
  ShowcaseItem,
  PresentationConfig,
} from "../../../dashboard/showcase/settings/config.schema";
import { ConfigurableCard } from "../../../dashboard/showcase/settings/ConfigurableCard";

interface ShowcaseSearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  items: ShowcaseItem[];
  onItemClick: (item: ShowcaseItem) => void;
  config: PresentationConfig;
}

export default function ShowcaseSearchOverlay({
  isOpen,
  onClose,
  items,
  onItemClick,
  config,
}: ShowcaseSearchOverlayProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when overlay opens
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
      setSearchQuery("");
    }
  }, [isOpen]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(query) ||
        item.subtitle?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query),
    );
  }, [items, searchQuery]);

  // Get recommended items (first 4 items) when no search query
  const recommendedItems = useMemo(() => {
    return items.slice(0, 4);
  }, [items]);

  const handleItemClick = (item: ShowcaseItem) => {
    onItemClick(item);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={`${styles.searchOverlayFullScreen} ${isOpen ? styles.searchOverlayVisible : ""}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Search Header */}
          <div className={styles.searchHeaderNew}>
            <div className={styles.searchInputWrapperNew}>
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
                className={styles.searchInputNew}
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
              />
              {searchQuery && (
                <button
                  className={styles.searchClearBtnNew}
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                >
                  <svg
                    width="18"
                    height="18"
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
              )}
            </div>
          </div>

          {/* Search Results */}
          <div className={styles.searchResultsNew}>
            {searchQuery.trim() === "" ? (
              // Show recommended items when no search
              <div className={styles.recommendedSection}>
                <h3 className={styles.recommendedTitle}>Recommended for you</h3>
                <motion.div
                  className={
                    styles.grid
                  } /* Use the main grid class for consistent layout */
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {recommendedItems.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <ConfigurableCard
                        item={item}
                        config={config}
                        onClick={() => handleItemClick(item)}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className={styles.searchEmptyNew}>
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <p>No items found for &quot;{searchQuery}&quot;</p>
                <span className={styles.searchEmptyHint}>
                  Try different keywords or browse all items
                </span>
              </div>
            ) : (
              <>
                <p className={styles.searchResultsCountNew}>
                  {filteredItems.length} item
                  {filteredItems.length !== 1 ? "s" : ""} found
                </p>
                <motion.div
                  className={styles.grid} /* Use main grid class */
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {filteredItems.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <ConfigurableCard
                        item={item}
                        config={config}
                        onClick={() => handleItemClick(item)}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
