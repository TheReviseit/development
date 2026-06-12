"use client";

import { useState, useEffect } from "react";
import { PresentationConfig } from "../settings/config.schema";
import { loadSettings } from "../settings/actions";

/**
 * Shared hook for fetching and caching showcase presentation config
 * ✅ IMPLEMENTS: In-memory caching (does NOT refetch on every mount)
 *
 * Cache Strategy:
 * - First call fetches from backend
 * - Subsequent calls return cached value
 * - Cache persists for session lifetime
 * - Manual refresh needed for updates (via settings page)
 */

// ✅ Module-level cache (persists across hook instances)
let cachedConfig: PresentationConfig | null = null;
let cacheLoadingPromise: Promise<void> | null = null;
let cacheError: string | null = null;

export function useShowcaseSettings() {
  const [config, setConfig] = useState<PresentationConfig | null>(cachedConfig);
  const [loading, setLoading] = useState(!cachedConfig);
  const [error, setError] = useState<string | null>(cacheError);

  useEffect(() => {
    // ✅ If already cached, use it immediately (no refetch)
    if (cachedConfig) {
      console.log("useShowcaseSettings: Using cached config");
      setConfig(cachedConfig);
      setLoading(false);
      return;
    }

    // ✅ If currently loading, wait for existing promise
    if (cacheLoadingPromise) {
      console.log("useShowcaseSettings: Waiting for in-flight request");
      cacheLoadingPromise.then(() => {
        setConfig(cachedConfig);
        setError(cacheError);
        setLoading(false);
      });
      return;
    }

    // ✅ First load: fetch from backend and cache result
    console.log("useShowcaseSettings: Fetching from backend (first time)");
    setLoading(true);

    cacheLoadingPromise = loadSettings()
      .then((presentationConfig) => {
        cachedConfig = presentationConfig; // ✅ loadSettings returns PresentationConfig directly
        cacheError = null;
        setConfig(cachedConfig);
        setError(null);
        console.log("useShowcaseSettings: Cached successfully", cachedConfig);
      })
      .catch((err) => {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to load settings";
        cacheError = errorMsg;
        setError(errorMsg);
        console.error("useShowcaseSettings: Error loading settings", err);
      })
      .finally(() => {
        setLoading(false);
        cacheLoadingPromise = null;
      });
  }, []);

  /**
   * Force refresh the cache (call this after saving settings)
   */
  const refreshCache = async () => {
    console.log("useShowcaseSettings: Force refresh requested");
    cachedConfig = null;
    cacheError = null;
    setLoading(true);

    try {
      const presentationConfig = await loadSettings();
      cachedConfig = presentationConfig; // ✅ Direct assignment
      setConfig(cachedConfig);
      setError(null);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to load settings";
      cacheError = errorMsg;
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return {
    config,
    loading,
    error,
    refreshCache,
  };
}

/**
 * Utility to manually clear cache (useful after settings update)
 */
export function clearShowcaseSettingsCache() {
  console.log("Clearing showcase settings cache");
  cachedConfig = null;
  cacheError = null;
  cacheLoadingPromise = null;
}
