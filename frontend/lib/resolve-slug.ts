/**
 * Slug Resolver Utility — Cached, High-Performance
 * ==================================================
 * Resolves a URL slug to a Firebase/Supabase user_id with in-memory caching.
 *
 * Resolution strategy (3-step fallback):
 *   1. businesses.url_slug_lower (canonical)
 *   2. users.username_lower (legacy)
 *   3. Direct user_id / firebase_uid match (backward compat)
 *
 * Cache layer:
 *   - 5-minute TTL for slug → userId mappings
 *   - Slugs rarely change, so high cache-hit rate expected
 *   - Cache invalidated via invalidateSlug() on slug change events
 *
 * Used by: payment-settings, orders, validate-stock, version, products
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  slugCache,
  slugKey,
  invalidateSlug as invalidateSlugCache,
} from "@/lib/cache/store-cache";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabase;
}

export interface SlugResolution {
  userId: string;
  canonicalSlug: string;
}

/**
 * Resolve a store slug to its user_id (Firebase UID) and canonical slug.
 * Results are cached for 5 minutes.
 */
export async function resolveSlug(
  slugOrUsername: string,
): Promise<SlugResolution | null> {
  if (!slugOrUsername) return null;

  const key = slugKey(slugOrUsername);

  // Check cache first
  const cached = slugCache.get(key);
  if (cached) return cached.value;

  // Cache miss — resolve from DB
  const result = await resolveSlugFromDB(slugOrUsername);

  // Cache the result (even null → we cache it as a negative lookup)
  if (result) {
    slugCache.set(key, result);
  }

  return result;
}

/**
 * Legacy-compatible wrapper that returns just the userId string.
 */
export async function resolveSlugToUserId(
  slugOrUsername: string,
): Promise<string | null> {
  const result = await resolveSlug(slugOrUsername);
  return result?.userId ?? null;
}

/**
 * Invalidate a cached slug mapping.
 */
export { invalidateSlugCache as invalidateSlug };

// =============================================================================
// Internal: DB Resolution (uncached)
// =============================================================================

async function resolveSlugFromDB(
  slugOrUsername: string,
): Promise<SlugResolution | null> {
  const supabase = getSupabase();
  const normalized = slugOrUsername.toLowerCase().trim();

  // STEP 1: businesses.url_slug_lower (PRIMARY — canonical URL)
  try {
    const { data: bizBySlug } = await supabase
      .from("businesses")
      .select("user_id, url_slug")
      .eq("url_slug_lower", normalized)
      .limit(1)
      .maybeSingle();

    if (bizBySlug?.user_id) {
      return {
        userId: bizBySlug.user_id,
        canonicalSlug: bizBySlug.url_slug || normalized,
      };
    }
  } catch (e) {
    console.error("[resolveSlug] Error querying businesses by slug:", e);
  }

  // STEP 2: users.username_lower (LEGACY fallback)
  try {
    const { data: userByUsername } = await supabase
      .from("users")
      .select("firebase_uid, username")
      .eq("username_lower", normalized)
      .limit(1)
      .maybeSingle();

    if (userByUsername?.firebase_uid) {
      // Check if user has a business slug (for canonical redirect)
      const { data: bizData } = await supabase
        .from("businesses")
        .select("url_slug")
        .eq("user_id", userByUsername.firebase_uid)
        .limit(1)
        .maybeSingle();

      return {
        userId: userByUsername.firebase_uid,
        canonicalSlug:
          bizData?.url_slug ||
          userByUsername.username?.toLowerCase() ||
          normalized,
      };
    }
  } catch (e) {
    console.error("[resolveSlug] Error querying users by username:", e);
  }

  // STEP 3: Direct user_id (backward compatibility)
  try {
    const { data: bizByUid } = await supabase
      .from("businesses")
      .select("user_id, url_slug")
      .eq("user_id", slugOrUsername)
      .limit(1)
      .maybeSingle();

    if (bizByUid?.user_id) {
      return {
        userId: bizByUid.user_id,
        canonicalSlug: bizByUid.url_slug || slugOrUsername,
      };
    }
  } catch (e) {
    console.error("[resolveSlug] Error in UID fallback:", e);
  }

  return null;
}
