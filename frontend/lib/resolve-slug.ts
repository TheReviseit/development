/**
 * Slug Resolver Utility — Shared by all /api/store/[username]/* routes
 *
 * Resolves a URL slug to a Firebase/Supabase user_id.
 * Uses the same 3-step resolution strategy as lib/store.ts:
 *   1. businesses.url_slug_lower (canonical)
 *   2. users.username_lower (legacy)
 *   3. Direct user_id / firebase_uid match (backward compat)
 *
 * This utility is used by checkout API routes (payment-settings, orders,
 * validate-stock) that need the actual user_id to query business data.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";

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

/**
 * Resolve a store slug to its user_id (Firebase UID).
 *
 * @param slugOrUsername - The URL parameter from /store/[username]
 * @returns The user_id or null if not found
 */
export async function resolveSlugToUserId(
  slugOrUsername: string,
): Promise<string | null> {
  if (!slugOrUsername) return null;

  const supabase = getSupabase();
  const normalized = slugOrUsername.toLowerCase().trim();

  // STEP 1: Try businesses.url_slug_lower (PRIMARY — canonical URL)
  try {
    const { data: bizBySlug } = await supabase
      .from("businesses")
      .select("user_id")
      .eq("url_slug_lower", normalized)
      .limit(1)
      .maybeSingle();

    if (bizBySlug?.user_id) {
      return bizBySlug.user_id;
    }
  } catch (e) {
    console.error("[resolveSlug] Error querying businesses by slug:", e);
  }

  // STEP 2: Try users.username_lower (LEGACY fallback)
  try {
    const { data: userByUsername } = await supabase
      .from("users")
      .select("firebase_uid")
      .eq("username_lower", normalized)
      .limit(1)
      .maybeSingle();

    if (userByUsername?.firebase_uid) {
      return userByUsername.firebase_uid;
    }
  } catch (e) {
    console.error("[resolveSlug] Error querying users by username:", e);
  }

  // STEP 3: Treat as direct user_id (backward compatibility)
  // Check if this value matches a business user_id or user firebase_uid
  try {
    const { data: bizByUid } = await supabase
      .from("businesses")
      .select("user_id")
      .eq("user_id", slugOrUsername)
      .limit(1)
      .maybeSingle();

    if (bizByUid?.user_id) {
      return bizByUid.user_id;
    }
  } catch (e) {
    console.error("[resolveSlug] Error in UID fallback:", e);
  }

  return null;
}
