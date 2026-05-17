import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createFetchWithTimeout } from "@/lib/server/fetchWithTimeout";
import type {
  ProductDomain,
  SupabaseUser,
} from "@/types/auth.types";
import { calculateTrialEndDate } from "@/lib/auth-helpers";

export type ProvisioningRequestContext = {
  request_id?: string;
  ip_address?: string | null;
  user_agent?: string | null;
  traceparent?: string | null;
};

export type EnsureUserAndMembershipParams = {
  supabase: SupabaseClient;
  firebaseUid: string;
  email: string;
  fullName: string;
  phoneNumber: string | null;
  currentProduct: ProductDomain;
  allowCreate: boolean;
  requestContext: ProvisioningRequestContext;
  /**
   * Optional: when legacy records exist in product_subscriptions, use them
   * to backfill user_products.
   */
  allowLegacyMigration?: boolean;
};

export type EnsureUserAndMembershipFullResult = {
  user: SupabaseUser;
  membership: any | null;
  created: boolean;
  hasAccess: boolean;
};

export function createSupabaseServiceClientOrThrow(options?: {
  timeoutMs?: number;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase environment variables");
  }

  const timeoutMs = options?.timeoutMs ?? 5000;
  const timeoutFetch = createFetchWithTimeout(timeoutMs);

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: timeoutFetch },
  });
}

export async function ensureSupabaseUserAndMembershipFull(
  params: EnsureUserAndMembershipParams,
): Promise<EnsureUserAndMembershipFullResult> {
  const {
    supabase,
    firebaseUid,
    email,
    fullName,
    phoneNumber,
    currentProduct,
    allowCreate,
    requestContext,
  } = params;

  try {
    const { data, error } = await supabase.rpc("provision_user_with_membership", {
      p_firebase_uid: firebaseUid,
      p_email: email,
      p_full_name: fullName,
      p_phone: phoneNumber,
      p_product: currentProduct,
      p_allow_create: allowCreate,
      // Auth sync is identity provisioning only. Product trials are created
      // exclusively by explicit onboarding plan selection.
      p_is_self_service: false,
      p_trial_days: 0,
      p_request_id: requestContext.request_id ?? null,
      p_ip_address: requestContext.ip_address ?? null,
      p_user_agent: requestContext.user_agent ?? null,
      p_traceparent: requestContext.traceparent ?? null,
    });

    if (error) throw error;
    if (!data || !data.user) throw new Error("PROVISIONING_RPC_EMPTY");

    return {
      user: data.user as SupabaseUser,
      membership: (data.membership ?? null) as any,
      created: Boolean(data.created),
      hasAccess: Boolean(data.has_access),
    };
  } catch (e: any) {
    const msg = String(e?.message || e);
    const looksLikeMissingFn =
      msg.includes("provision_user_with_membership") &&
      (msg.includes("does not exist") || msg.includes("Could not find the function"));

    if (!looksLikeMissingFn) throw e;

    return await legacyEnsureSupabaseUserAndMembership(params);
  }
}

async function ensureDashboardMembership(
  supabase: SupabaseClient,
  userId: string,
  requestContext: ProvisioningRequestContext,
) {
  const { data: existing } = await supabase
    .from("user_products")
    .select("id,status")
    .eq("user_id", userId)
    .eq("product", "dashboard")
    .maybeSingle();

  if (existing) return;

  const { error } = await supabase.from("user_products").insert({
    user_id: userId,
    product: "dashboard",
    status: "active",
    activated_by: "system",
  });

  if (!error) {
    await supabase.from("product_activation_logs").insert({
      user_id: userId,
      product: "dashboard",
      action: "activated",
      new_status: "active",
      initiated_by: "system",
      request_id: requestContext.request_id,
      ip_address: requestContext.ip_address,
      user_agent: requestContext.user_agent,
      metadata: { heal_reason: "missing_dashboard_membership" },
    });
  }
}

async function maybeBackfillMembershipFromLegacyProductSubscriptions(params: {
  supabase: SupabaseClient;
  userId: string;
  product: ProductDomain;
  requestContext: ProvisioningRequestContext;
}): Promise<boolean> {
  const { supabase, userId, product, requestContext } = params;

  if (product === "dashboard") return false;

  try {
    const { data: legacyRow } = await supabase
      .from("product_subscriptions")
      .select("status,expires_at,subscribed_at,product_domain")
      .eq("user_id", userId)
      .eq("product_domain", product)
      .in("status", ["active", "trial"])
      .maybeSingle();

    if (!legacyRow) return false;

    const status = legacyRow.status === "active" ? "active" : "trial";
    const trialEndsAt =
      status === "trial"
        ? legacyRow.expires_at
          ? new Date(legacyRow.expires_at)
          : calculateTrialEndDate(14)
        : null;

    const { error: upsertError } = await supabase.from("user_products").upsert(
      {
        user_id: userId,
        product,
        status,
        activated_by: "migration",
        trial_ends_at: trialEndsAt ? trialEndsAt.toISOString() : null,
        trial_days: status === "trial" ? 14 : null,
      },
      { onConflict: "user_id,product" },
    );

    if (upsertError) return false;

    await supabase.from("product_activation_logs").insert({
      user_id: userId,
      product,
      action: status === "trial" ? "trial_started" : "activated",
      new_status: status,
      initiated_by: "migration",
      request_id: requestContext.request_id,
      ip_address: requestContext.ip_address,
      user_agent: requestContext.user_agent,
      metadata: { heal_reason: "legacy_product_subscriptions_backfill" },
    });

    return true;
  } catch {
    // Table may not exist in some environments; ignore.
    return false;
  }
}

async function ensureCurrentProductMembership(params: {
  supabase: SupabaseClient;
  userId: string;
  currentProduct: ProductDomain;
  requestContext: ProvisioningRequestContext;
  allowLegacyMigration: boolean;
}): Promise<any | null> {
  const {
    supabase,
    userId,
    currentProduct,
    requestContext,
    allowLegacyMigration,
  } = params;

  if (currentProduct === "dashboard" || currentProduct === "files") return null;

  const { data: membership } = await supabase
    .from("user_products")
    .select("*")
    .eq("user_id", userId)
    .eq("product", currentProduct)
    .maybeSingle();

  if (membership) return membership;

  // If legacy records exist (previous architecture), backfill membership.
  if (allowLegacyMigration) {
    const healed = await maybeBackfillMembershipFromLegacyProductSubscriptions({
      supabase,
      userId,
      product: currentProduct,
      requestContext,
    });
    if (healed) {
      const { data: healedMembership } = await supabase
        .from("user_products")
        .select("*")
        .eq("user_id", userId)
        .eq("product", currentProduct)
        .maybeSingle();
      return healedMembership ?? null;
    }
  }

  return null;
}

export async function ensureSupabaseUserAndMembership(
  params: EnsureUserAndMembershipParams,
): Promise<{ user: SupabaseUser; created: boolean }> {
  const full = await ensureSupabaseUserAndMembershipFull(params);
  return { user: full.user, created: full.created };
}

async function legacyEnsureSupabaseUserAndMembership(
  params: EnsureUserAndMembershipParams,
): Promise<EnsureUserAndMembershipFullResult> {
  const {
    supabase,
    firebaseUid,
    email,
    fullName,
    phoneNumber,
    currentProduct,
    allowCreate,
    requestContext,
    allowLegacyMigration = true,
  } = params;

  // 1) Fetch by firebase_uid (primary key for identity in this architecture)
  const { data: existingUser, error: fetchError } = await supabase
    .from("users")
    .select("*")
    .eq("firebase_uid", firebaseUid)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  let user = existingUser as SupabaseUser | null;
  let created = false;

  // 2) If missing: attempt email-based migration (Firebase project switch)
  // Safe because we only trust email from a verified Firebase ID token.
  if (!user && email) {
    const { data: existingByEmail, error: emailFetchError } = await supabase
      .from("users")
      .select("*")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (emailFetchError) {
      throw emailFetchError;
    }

    if (existingByEmail) {
      const { data: updated, error: updateError } = await supabase
        .from("users")
        .update({ firebase_uid: firebaseUid })
        .eq("id", existingByEmail.id)
        .select()
        .single();

      if (updateError || !updated) {
        throw updateError || new Error("Failed to migrate firebase_uid");
      }

      user = updated as SupabaseUser;
      created = false;
    }
  }

  // 3) Create user if missing and allowed
  if (!user) {
    if (!allowCreate) {
      const err: any = new Error("USER_NOT_FOUND");
      err.code = "USER_NOT_FOUND";
      throw err;
    }

    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        firebase_uid: firebaseUid,
        full_name: fullName,
        email,
        phone: phoneNumber,
        role: "user",
      })
      .select()
      .single();

    if (insertError || !newUser) {
      throw insertError || new Error("Failed to create user");
    }

    user = newUser as SupabaseUser;
    created = true;
  }

  // 4) Always ensure baseline membership
  await ensureDashboardMembership(supabase, user.id, requestContext);

  // 5) Backfill existing paid/trial access from legacy records only.
  // New trials are created only after explicit onboarding plan selection.
  const membership = await ensureCurrentProductMembership({
    supabase,
    userId: user.id,
    currentProduct,
    requestContext,
    allowLegacyMigration,
  });

  const trialEndsAt = membership?.trial_ends_at
    ? new Date(membership.trial_ends_at)
    : null;
  const hasAccess =
    currentProduct === "dashboard" ||
    currentProduct === "files" ||
    membership?.status === "active" ||
    (membership?.status === "trial" &&
      (!trialEndsAt || Number.isNaN(trialEndsAt.getTime()) || trialEndsAt > new Date()));

  return { user, created, membership, hasAccess };
}
