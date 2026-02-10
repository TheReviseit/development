/**
 * PreviewPane - Live preview of showcase card
 * Read-only component that updates instantly when config changes
 */

"use client";

import React from "react";
import styles from "./PreviewPane.module.css";
import { ConfigurableCard } from "./ConfigurableCard";
import { PresentationConfig, MOCK_PREVIEW_ITEM } from "./config.schema";

interface PreviewPaneProps {
  config: PresentationConfig;
}

export function PreviewPane({ config }: PreviewPaneProps) {
  return (
    <div className={styles.previewPane}>
      <div className={styles.header}>
        <h2 className={styles.title}>Live Preview</h2>
        <p className={styles.subtitle}>
          This is how your showcase card will appear to customers
        </p>
      </div>

      <div className={styles.previewContainer}>
        <div className={styles.cardWrapper}>
          <ConfigurableCard
            item={MOCK_PREVIEW_ITEM}
            config={config}
            onClick={() => {
              // Preview is read-only
              console.log("Preview card clicked (read-only)");
            }}
            onOrderClick={() => {
              console.log("Order button clicked (preview)");
            }}
            onBookClick={() => {
              console.log("Book button clicked (preview)");
            }}
          />
        </div>

        <div className={styles.hint}>
          <p>💡 Changes update instantly</p>
        </div>
      </div>
    </div>
  );
}
