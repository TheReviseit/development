/**
 * Showcase Settings Actions
 * Load and save showcase configuration
 */

import {
  PresentationConfig,
  validateConfig,
  DEFAULT_CONFIG,
} from "./config.schema";
import { auth } from "@/src/firebase/firebase";
import { supabase } from "@/lib/supabase/client";
import debounce from "lodash/debounce";

// Supabase client is used directly to avoid the extra Next.js proxy hop.
// A 500 ms debounce is applied to all save operations to coalesce rapid edits.

const DEBOUNCED_SAVE = debounce(async (userId: string, config: PresentationConfig) => {
  const { error } = await supabase
    .from("showcase_settings")
    .upsert({
      user_id: userId,
      presentation: config,
      content_type: "generic",
      version: 1,
    })
    .single();
  if (error) {
    console.error("Supabase upsert error:", error);
    throw new Error(error.message);
  }
}, 500);


// ============================================
// HELPER: Get current Firebase UID (client side)
// ============================================

function getCurrentUserId(): string | null {
  // Firebase auth instance provides uid directly on the user object.
  // No token exchange required for client‑side reads – the Supabase
  // client will use Row‑Level Security (RLS) policies that trust the
  // Firebase UID via the custom claim set on the service token.
  // For simplicity in this Phase 1 fix we just return the UID.
  const user = auth?.currentUser;
  if (!user) {
    console.error("No authenticated Firebase user");
    return null;
  }
  return user.uid;
}

// ============================================
// LOAD SETTINGS
// ============================================

export async function loadSettings(): Promise<PresentationConfig> {
  try {
    const userId = getCurrentUserId();
    if (!userId) {
      console.warn("Not authenticated, using default config");
      return DEFAULT_CONFIG;
    }

    // Direct Supabase fetch – avoids the Next.js proxy.
    const { data, error } = await supabase
      .from("showcase_settings")
      .select("presentation, version, content_type")
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      console.warn("Failed to load settings from Supabase, using defaults", error);
      return DEFAULT_CONFIG;
    }

    // Version assertion (fallback to defaults if mismatched)
    if (data.version !== 1) {
      console.error(`Unsupported config version: ${data.version}`);
      return DEFAULT_CONFIG;
    }

    // Validate shape
    if (!validateConfig(data.presentation)) {
      console.error("Invalid config shape, using defaults");
      return DEFAULT_CONFIG;
    }

    return data.presentation as PresentationConfig;
  } catch (error) {
    console.error("Error loading settings:", error);
    return DEFAULT_CONFIG;
  }
}

// ============================================
// SAVE SETTINGS
// ============================================

// ============================================
// SAVE SETTINGS (debounced upsert)
// ============================================

export async function saveSettings(
  config: PresentationConfig,
): Promise<boolean> {
  try {
    // Validate before persisting
    if (!validateConfig(config)) {
      throw new Error("Invalid configuration shape");
    }

    const userId = getCurrentUserId();
    if (!userId) {
      throw new Error("Not authenticated. Please login to save settings.");
    }

    // Fire the debounced upsert. It returns void; we consider the call a success.
    DEBOUNCED_SAVE(userId, config);
    return true;
  } catch (error) {
    console.error("Error saving settings:", error);
    throw error;
  }
}
