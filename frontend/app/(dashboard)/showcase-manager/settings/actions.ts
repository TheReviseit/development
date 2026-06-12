/**
 * Showcase Settings Actions
 * Load and save showcase configuration
 */

import {
  PresentationConfig,
  ShowcaseSettings,
  validateConfig,
  DEFAULT_CONFIG,
} from "./config.schema";
import { auth } from "@/src/firebase/firebase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

// ============================================
// HELPER: Get Firebase ID Token
// ============================================

async function getAuthToken(): Promise<string | null> {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.error("No authenticated user");
      return null;
    }
    const token = await user.getIdToken();
    return token;
  } catch (error) {
    console.error("Error getting auth token:", error);
    return null;
  }
}

// ============================================
// LOAD SETTINGS
// ============================================

export async function loadSettings(): Promise<PresentationConfig> {
  try {
    const token = await getAuthToken();
    if (!token) {
      console.warn("Not authenticated, using default config");
      return DEFAULT_CONFIG;
    }

    const response = await fetch(`${API_BASE}/api/showcase/settings`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      console.warn("Failed to load settings, using defaults");
      return DEFAULT_CONFIG;
    }

    const data: ShowcaseSettings = await response.json();

    // Version assertion
    if (data.version !== 1) {
      console.error(`Unsupported config version: ${data.version}`);
      return DEFAULT_CONFIG;
    }

    // Validate shape
    if (!validateConfig(data.presentation)) {
      console.error("Invalid config shape, using defaults");
      return DEFAULT_CONFIG;
    }

    return data.presentation;
  } catch (error) {
    console.error("Error loading settings:", error);
    return DEFAULT_CONFIG;
  }
}

// ============================================
// SAVE SETTINGS
// ============================================

export async function saveSettings(
  config: PresentationConfig,
): Promise<boolean> {
  try {
    // Validate before sending
    if (!validateConfig(config)) {
      throw new Error("Invalid configuration shape");
    }

    const token = await getAuthToken();
    if (!token) {
      throw new Error("Not authenticated. Please login to save settings.");
    }

    const response = await fetch(`${API_BASE}/api/showcase/settings`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        presentation: config,
        contentType: "generic", // TODO: Make this configurable
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to save settings");
    }

    return true;
  } catch (error) {
    console.error("Error saving settings:", error);
    throw error;
  }
}
