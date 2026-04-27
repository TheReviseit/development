import { supabase } from "./client";
import { supabaseAdmin } from "./server";

// Database type definitions
export interface User {
  id: string;
  firebase_uid: string;
  full_name: string;
  email: string;
  phone?: string;
  role: string;
  // v2: Event-sourced onboarding state (replaces boolean)
  onboarding_completed_at?: string;  // TIMESTAMPTZ - null means not completed
  onboarding_completed_reason?: 'trial_start' | 'subscription' | 'manual' | 'whatsapp_connect' | 'migrated';
  onboarding_completed_via?: 'trigger' | 'api' | 'manual' | 'migration';
  created_at: string;
  updated_at: string;
}

// Computed helper - use this instead of accessing user.onboarding_completed directly
export function isOnboardingCompleted(user: User | null): boolean {
  return user?.onboarding_completed_at != null;
}

export interface Business {
  id: string;
  user_id: string;
  business_name: string;
  url_slug: string;
  url_slug_lower: string;
  category: string;
  website?: string;
  address?: string;
  logo_url?: string;
  timezone: string;
  language?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface WhatsAppConnection {
  id: string;
  business_id: string;
  provider_type: "cloud_api" | "gupshup" | "twilio" | "360dialog";
  phone_number: string;
  phone_number_id?: string;
  business_id_meta?: string;
  api_token: string; // Encrypted
  default_sender_name: string;
  messaging_category?: "transactional" | "marketing";
  status: "connected" | "pending" | "failed";
  test_number?: string;
  created_at: string;
  updated_at: string;
}

// User queries
export async function getUserByFirebaseUID(firebaseUID: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("firebase_uid", firebaseUID)
    .maybeSingle(); // Use maybeSingle() instead of single() to avoid PGRST116 error

  if (error) {
    console.error("Error fetching user:", error);
    return null;
  }
  return data as User | null;
}

// Get user by email (useful for Firebase project migrations)
export async function getUserByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user by email:", error);
    return null;
  }
  return data as User | null;
}

// Update user's firebase_uid (for Firebase project migrations)
export async function updateUserFirebaseUID(
  email: string,
  newFirebaseUID: string,
) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ firebase_uid: newFirebaseUID })
    .eq("email", email)
    .select()
    .single();

  if (error) {
    console.error("Error updating firebase_uid:", error);
    throw error;
  }
  return data as User;
}

export async function createUser(userData: {
  firebase_uid: string;
  full_name: string;
  email: string;
  phone?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .insert([userData])
    .select()
    .single();

  if (error) {
    console.error("Error creating user:", error);
    throw error;
  }
  return data as User;
}

export async function updateUser(firebaseUID: string, updates: Partial<User>) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .update(updates)
    .eq("firebase_uid", firebaseUID)
    .select()
    .single();

  if (error) {
    console.error("Error updating user:", error);
    throw error;
  }
  return data as User;
}

// Business queries
export async function getBusinessByUserId(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 is "not found" error
    console.error("Error fetching business:", error);
    return null;
  }
  return data as Business | null;
}

export async function createOrUpdateBusiness(
  userId: string,
  businessData: Omit<
    Business,
    | "id"
    | "user_id"
    | "created_at"
    | "updated_at"
    | "url_slug"
    | "url_slug_lower"
  > &
    Partial<Pick<Business, "url_slug" | "url_slug_lower">>,
) {
  // Check if business exists
  const existing = await getBusinessByUserId(userId);

  if (existing) {
    // Update existing
    const { data, error } = await supabaseAdmin
      .from("businesses")
      .update(businessData)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating business:", error);
      throw error;
    }
    return data as Business;
  } else {
    // Create new
    const { data, error } = await supabaseAdmin
      .from("businesses")
      .insert([{ ...businessData, user_id: userId }])
      .select()
      .single();

    if (error) {
      console.error("Error creating business:", error);
      throw error;
    }
    return data as Business;
  }
}

// WhatsApp connection queries
export async function getWhatsAppConnection(businessId: string) {
  const { data, error } = await supabaseAdmin
    .from("whatsapp_connections")
    .select("*")
    .eq("business_id", businessId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching WhatsApp connection:", error);
    return null;
  }
  return data as WhatsAppConnection | null;
}

export async function createOrUpdateWhatsAppConnection(
  businessId: string,
  connectionData: Omit<
    WhatsAppConnection,
    "id" | "business_id" | "created_at" | "updated_at"
  >,
) {
  // Check if connection exists
  const existing = await getWhatsAppConnection(businessId);

  if (existing) {
    // Update existing
    const { data, error } = await supabaseAdmin
      .from("whatsapp_connections")
      .update(connectionData)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating WhatsApp connection:", error);
      throw error;
    }
    return data as WhatsAppConnection;
  } else {
    // Create new
    const { data, error } = await supabaseAdmin
      .from("whatsapp_connections")
      .insert([{ ...connectionData, business_id: businessId }])
      .select()
      .single();

    if (error) {
      console.error("Error creating WhatsApp connection:", error);
      throw error;
    }
    return data as WhatsAppConnection;
  }
}

// Mark onboarding as complete (v2 - uses timestamp)
// Note: Prefer DB triggers for atomicity - this is for manual override only
export async function markOnboardingComplete(firebaseUID: string) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .update({ 
      onboarding_completed_at: new Date().toISOString(),
      onboarding_completed_reason: 'manual',
      onboarding_completed_via: 'api',
    })
    .eq("firebase_uid", firebaseUID)
    .select()
    .single();

  if (error) {
    console.error("Error marking onboarding complete:", error);
    throw error;
  }
  return data;
}

// =============================================================================
// LIFECYCLE: Business initialization guarantee
// =============================================================================
//
// ARCHITECTURE: Called at signup to ensure a business row always exists.
// DB trigger is the SOLE slug generator — application inserts with NULL slug,
// trigger fills it from business_name or Supabase UUID fallback.
// Uses INSERT ON CONFLICT to prevent race conditions (UNIQUE user_id).
//
// AI onboarding is OPTIONAL ENHANCEMENT — it may later update business_name
// and trigger slug regeneration (with consent), but slug always exists.
// =============================================================================

export async function ensureBusinessExists(
  supabaseUserId: string,
): Promise<void> {
  // Idempotent: INSERT ON CONFLICT (user_id) DO NOTHING
  // Slug generated by DB trigger, not application
  const { error } = await supabaseAdmin
    .from("businesses")
    .upsert(
      { user_id: supabaseUserId },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

  if (error) {
    // Log but don't throw — business may already exist (expected path)
    // PGRST116 (not found) is impossible for upsert, but catch any other
    console.error("[ensureBusinessExists] Error:", error);
  }
}

// Email-related queries

// Get all active users (users who have logged in)
export async function getAllActiveUsers() {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, firebase_uid, full_name, email, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching active users:", error);
    return [];
  }
  return data as Array<
    Pick<
      User,
      "id" | "firebase_uid" | "full_name" | "email" | "role" | "created_at"
    >
  >;
}

// Get users by filter criteria
export async function getUsersByFilter(filters: {
  role?: string;
  onboardingCompleted?: boolean;
}) {
  let query = supabaseAdmin
    .from("users")
    .select("id, firebase_uid, full_name, email, role, created_at, onboarding_completed_at");

  if (filters.role) {
    query = query.eq("role", filters.role);
  }

  // v2: Use timestamp-based filtering instead of boolean
  if (filters.onboardingCompleted !== undefined) {
    if (filters.onboardingCompleted) {
      // Onboarded users: have a timestamp
      query = query.not("onboarding_completed_at", "is", null);
    } else {
      // Not onboarded users: no timestamp
      query = query.is("onboarding_completed_at", null);
    }
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching filtered users:", error);
    return [];
  }
  return data as Array<
    Pick<
      User,
      "id" | "firebase_uid" | "full_name" | "email" | "role" | "created_at" | "onboarding_completed_at"
    >
  >;
}

// Subscription queries
export async function getSubscriptionByUserId(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .in("status", [
      "active",
      "completed",
      "processing",
      "pending_upgrade",
      "upgrade_failed",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Error fetching subscription:", error);
    return null;
  }
  return data;
}

// =============================================================================
// LEGACY: PRODUCT_SUBSCRIPTIONS — Per-Domain Access Control (Deprecated)
// =============================================================================
// This table is kept for backwards compatibility with older deployments.
// The canonical access-control model is Option B `public.user_products`.

const SUBSCRIBABLE_DOMAINS = new Set(["shop", "marketing", "showcase", "api"]);

/**
 * Record a product domain subscription for a user.
 * Uses upsert to handle reactivation of expired subscriptions.
 *
 * @param userId - Supabase user ID (from `users` table)
 * @param productDomain - One of: shop, marketing, showcase, api
 */
export async function recordProductSubscription(
  userId: string,
  productDomain: string,
): Promise<void> {
  if (!SUBSCRIBABLE_DOMAINS.has(productDomain)) return;

  const { error } = await supabaseAdmin.from("product_subscriptions").upsert(
    {
      user_id: userId,
      org_id: userId, // For Firebase users, user acts as their own org
      product_domain: productDomain,
      status: "active",
      metadata: { source: "signup" },
    },
    { onConflict: "user_id,product_domain" },
  );

  if (error) {
    console.error(
      `[recordProductSubscription] Error for ${productDomain}:`,
      error,
    );
    // Non-fatal: don't throw — subscription failure shouldn't block signup
  }
}

/**
 * Get all product domains a user has active subscriptions for.
 * Returns at minimum ['dashboard'] (always implicitly granted).
 */
export async function getUserProductSubscriptions(
  userId: string,
): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("product_subscriptions")
    .select("product_domain, status")
    .eq("user_id", userId)
    .in("status", ["active", "trial"]);

  if (error) {
    console.error("[getUserProductSubscriptions] Error:", error);
    return ["dashboard"]; // Fail-safe
  }

  const domains = ["dashboard"]; // Always included
  for (const row of data || []) {
    domains.push(row.product_domain);
  }
  return domains;
}
