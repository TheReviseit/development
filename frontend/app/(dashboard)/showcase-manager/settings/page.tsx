/**
 * Showcase Settings Page
 * Sprint 2: Card Configurator UI
 *
 * Architecture:
 * - Single source of truth (config state)
 * - Instant preview updates
 * - Safe save flow with validation
 */

"use client";

import React, { useState, useEffect } from "react";
import styles from "./page.module.css";
import { PreviewPane } from "./PreviewPane";
import { ConfigPanel } from "./ConfigPanel";
import { PresentationConfig, DEFAULT_CONFIG } from "./config.schema";
import { loadSettings, saveSettings } from "./actions";
import { clearShowcaseSettingsCache } from "../hooks/useShowcaseSettings"; // ✅ Import cache clear

export default function ShowcaseSettingsPage() {
  // Single source of truth
  const [config, setConfig] = useState<PresentationConfig>(DEFAULT_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    async function load() {
      try {
        const loadedConfig = await loadSettings();
        setConfig(loadedConfig);
      } catch (err) {
        console.error("Failed to load settings:", err);
        setError("Failed to load settings. Using defaults.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // Save handler
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await saveSettings(config);

      // ✅ CRITICAL: Clear cache so add product form picks up new settings
      clearShowcaseSettingsCache();
      console.log("✅ Settings saved & cache cleared");

      setSuccessMessage("Settings saved successfully!");

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save:", err);
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Showcase Card Settings</h1>
          <p className={styles.pageSubtitle}>
            Configure how your showcase items appear to customers
          </p>
        </div>
      </div>

      {/* Toast Notifications */}
      {error && (
        <div className={styles.toast} data-type="error">
          ❌ {error}
        </div>
      )}
      {successMessage && (
        <div className={styles.toast} data-type="success">
          ✅ {successMessage}
        </div>
      )}

      {/* Split View: Preview + Config */}
      <div className={styles.splitView}>
        {/* Left: Live Preview */}
        <div className={styles.leftPane}>
          <PreviewPane config={config} />
        </div>

        {/* Right: Configuration Panel */}
        <div className={styles.rightPane}>
          <ConfigPanel
            config={config}
            onChange={setConfig}
            onSave={handleSave}
            isSaving={isSaving}
          />
        </div>
      </div>
    </div>
  );
}
