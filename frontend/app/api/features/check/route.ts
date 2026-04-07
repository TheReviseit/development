import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

// Initialize Supabase with service role (bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * GET /api/features/check?feature=create_product
 *
 * Lightweight feature check endpoint that queries plan_features
 * to return the user's limit for a given feature key.
 *
 * Usage is read from `usage_counters` — the single source of truth
 * populated atomically by the backend FeatureGateEngine.
 *
 * Response:
 *   { allowed: boolean, hard_limit: number|null, is_unlimited: boolean, used: number }
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const result = await verifySessionCookieSafe(sessionCookie, true);
    if (!result.success) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const firebaseUid = result.data!.uid;

    // Get feature key from query params
    const { searchParams } = new URL(request.url);
    const featureKey = searchParams.get("feature");

    if (!featureKey) {
      return NextResponse.json(
        { error: "Missing 'feature' query parameter" },
        { status: 400 },
      );
    }

    const supabase = getSupabase();

    // ── Resolve product domain ──────────────────────────────────────
    // Accept optional ?domain= parameter. Default to "shop" for
    // backwards compatibility, but allow callers to specify "marketing"
    // etc. so the correct subscription is looked up.
    const domain = searchParams.get("domain") || "shop";

    // ── Resolve Firebase UID → Supabase UUID ──────────────────────────
    // Subscriptions and usage_counters use Supabase UUID.
    const { data: userRow } = await supabase
      .from("users")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .limit(1)
      .maybeSingle();

    const supabaseUserId = userRow?.id; // UUID for subscriptions + usage_counters

    // 1. Get user's active subscription for the requested domain
    //    Must use Supabase UUID — subscriptions.user_id is a FK to users.id
    if (!supabaseUserId) {
      // User record missing — can't look up subscription
      console.warn(
        `🚫 [FeatureCheck] No Supabase user found for Firebase UID ${firebaseUid}. Returning NO_SUBSCRIPTION.`,
      );
      return NextResponse.json({
        allowed: false,
        hard_limit: 0,
        soft_limit: 0,
        is_unlimited: false,
        used: 0,
        remaining: 0,
        denial_reason: "NO_SUBSCRIPTION",
        upgrade_required: true,
        feature_key: featureKey,
      });
    }

    const ACTIVE_STATUSES = [
      "active",
      "completed",
      "past_due",
      "grace_period",
      "trialing",
      "trial",
      "processing",
      "pending_upgrade",
      "upgrade_failed",
    ];

    // Try the requested domain first
    let subscriptionRaw: {
      pricing_plan_id: string | null;
      plan_id: string | null;
      status: string;
      pending_plan_slug: string | null;
      product_domain?: string;
      plan_name?: string;
    } | null = null;

    const { data: domainSub } = await supabase
      .from("subscriptions")
      .select("pricing_plan_id, plan_id, status, pending_plan_slug, product_domain, plan_name")
      .eq("user_id", supabaseUserId)
      .eq("product_domain", domain)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    subscriptionRaw = domainSub;

    // Fallback: if no subscription in the requested domain, try other
    // domains. This handles the common case where the dashboard serves
    // multiple domains but the caller doesn't know which one the user
    // subscribed to.
    if (!subscriptionRaw) {
      const { data: anySub } = await supabase
        .from("subscriptions")
        .select("pricing_plan_id, plan_id, status, pending_plan_slug, product_domain, plan_name")
        .eq("user_id", supabaseUserId)
        .neq("product_domain", domain)
        .in("status", ACTIVE_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (anySub) {
        console.log(
          `🔄 [FeatureCheck] No subscription in domain="${domain}", using domain="${anySub.product_domain}" for user ${firebaseUid}`,
        );
        subscriptionRaw = anySub;
      }
    }

    // ===================================================================
    // CRITICAL FIX: Check for active trial if no subscription found
    // Trial users should have feature access based on their plan
    // ===================================================================
    if (!subscriptionRaw) {
      // Check free_trials table for active trial
      const { data: trial } = await supabase
        .from("free_trials")
        .select("id, status, plan_slug, domain, expires_at")
        .eq("user_id", supabaseUserId)
        .eq("domain", domain)
        .in("status", ["active", "expiring_soon"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (trial) {
        console.log(
          `✅ [FeatureCheck] User ${firebaseUid} has active trial (${trial.plan_slug}), granting feature access`
        );

        // Get plan features for the trial plan
        const { data: trialPlan } = await supabase
          .from("pricing_plans")
          .select("id, plan_slug")
          .eq("plan_slug", trial.plan_slug)
          .eq("product_domain", domain)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();

        if (trialPlan) {
          // Get feature limits for trial plan
          const { data: trialFeatures } = await supabase
            .from("plan_features")
            .select("hard_limit, soft_limit, is_unlimited, feature_key")
            .eq("plan_id", trialPlan.id)
            .eq("feature_key", featureKey)
            .limit(1)
            .maybeSingle();

          if (trialFeatures) {
            // Get current usage
            let used = 0;
            const { data: counter } = await supabase
              .from("usage_counters")
              .select("current_value")
              .eq("user_id", supabaseUserId)
              .eq("domain", domain)
              .eq("feature_key", featureKey)
              .maybeSingle();
            used = counter?.current_value ?? 0;

            // Handle create_product counter reconciliation
            if (featureKey === "create_product") {
              const { count: productCount } = await supabase
                .from("products")
                .select("id", { count: "exact", head: true })
                .eq("user_id", firebaseUid)
                .neq("is_deleted", true);

              const pCount = productCount ?? 0;
              let vCount = 0;
              if (pCount > 0) {
                const { data: productIds } = await supabase
                  .from("products")
                  .select("id")
                  .eq("user_id", firebaseUid)
                  .neq("is_deleted", true);

                if (productIds && productIds.length > 0) {
                  const ids = productIds.map((p) => p.id);
                  const { count: variantCount } = await supabase
                    .from("product_variants")
                    .select("id", { count: "exact", head: true })
                    .in("product_id", ids);
                  vCount = variantCount ?? 0;
                }
              }

              const actualCount = pCount + vCount;
              if (actualCount > used) {
                used = actualCount;
              }
            }

            const allowed = trialFeatures.is_unlimited || 
                           trialFeatures.hard_limit === null || 
                           used < trialFeatures.hard_limit;

            return NextResponse.json({
              allowed,
              hard_limit: trialFeatures.hard_limit,
              soft_limit: trialFeatures.soft_limit,
              is_unlimited: trialFeatures.is_unlimited,
              used,
              remaining: trialFeatures.is_unlimited
                ? null
                : trialFeatures.hard_limit !== null
                  ? Math.max(0, trialFeatures.hard_limit - used)
                  : null,
              feature_key: featureKey,
              trial_mode: true,
              trial_plan: trial.plan_slug,
              trial_expires_at: trial.expires_at,
            });
          }
        }
      }

      // FAIL CLOSED: No subscription and no trial = deny access
      console.log(
        `🚫 [FeatureCheck] No subscription or trial for user ${firebaseUid}, domain=${domain}`
      );
      return NextResponse.json({
        allowed: false,
        hard_limit: 0,
        soft_limit: 0,
        is_unlimited: false,
        used: 0,
        remaining: 0,
        denial_reason: "NO_SUBSCRIPTION",
        upgrade_required: true,
        feature_key: featureKey,
      });
    }

    // Resolve pricing_plan_id — may be null if only plan_id (Razorpay ID) is stored
    let resolvedPricingPlanId: string | null =
      subscriptionRaw.pricing_plan_id ?? null;

    if (!resolvedPricingPlanId && subscriptionRaw.plan_id) {
      // plan_id is the Razorpay plan ID — look up the pricing_plans row
      const { data: pricingPlan } = await supabase
        .from("pricing_plans")
        .select("id")
        .eq("razorpay_plan_id", subscriptionRaw.plan_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      resolvedPricingPlanId = pricingPlan?.id ?? null;

      // Back-fill the FK so future lookups are fast
      if (resolvedPricingPlanId) {
        const subDomain = subscriptionRaw.product_domain || domain;
        await supabase
          .from("subscriptions")
          .update({ pricing_plan_id: resolvedPricingPlanId })
          .eq("user_id", supabaseUserId)
          .eq("product_domain", subDomain);
        console.log(
          `✅ [FeatureCheck] Back-filled pricing_plan_id=${resolvedPricingPlanId} for user ${firebaseUid}`,
        );
      }
    }

    // ── PENDING UPGRADE: Use the TARGET plan's features, not the old plan ──
    // When a user pays for an upgrade, pending_plan_slug is set to the new
    // plan (e.g., "business"). Grant them the new plan's features immediately.
    // This covers BOTH flows:
    //   1. checkout flow: status = "pending_upgrade"
    //   2. change-plan flow: status stays "active"/"completed" with pending_plan_slug set
    // In either case, if pending_plan_slug is set the user has initiated (and
    // possibly paid for) an upgrade — grant the target plan's features.
    if (subscriptionRaw.pending_plan_slug) {
      const { data: targetPlan } = await supabase
        .from("pricing_plans")
        .select("id")
        .eq("plan_slug", subscriptionRaw.pending_plan_slug)
        .eq("product_domain", subscriptionRaw.product_domain || domain)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (targetPlan?.id) {
        console.log(
          `🔄 [FeatureCheck] pending_upgrade: using target plan ${subscriptionRaw.pending_plan_slug} (${targetPlan.id}) instead of current plan`,
        );
        resolvedPricingPlanId = targetPlan.id;
      }
    }

    const subscription = { pricing_plan_id: resolvedPricingPlanId };

    if (!subscription.pricing_plan_id) {
      // FAIL CLOSED: No subscription = deny access
      return NextResponse.json({
        allowed: false,
        hard_limit: 0,
        soft_limit: 0,
        is_unlimited: false,
        used: 0,
        remaining: 0,
        denial_reason: "NO_SUBSCRIPTION",
        upgrade_required: true,
        feature_key: featureKey,
      });
    }

    // 2. Get plan feature config for the requested feature
    const { data: planFeatures } = await supabase
      .from("plan_features")
      .select("hard_limit, soft_limit, is_unlimited, feature_key")
      .eq("plan_id", subscription.pricing_plan_id)
      .eq("feature_key", featureKey)
      .limit(1)
      .maybeSingle();

    // 3. Get current usage from usage_counters (single source of truth)
    //    usage_counters is populated atomically by the backend FeatureGateEngine.
    let used = 0;
    const { data: counter } = await supabase
      .from("usage_counters")
      .select("current_value")
      .eq("user_id", supabaseUserId)
      .eq("domain", subscriptionRaw.product_domain || domain)
      .eq("feature_key", featureKey)
      .maybeSingle();
    used = counter?.current_value ?? 0;

    // 3b. Counter reconciliation for create_product
    // CRITICAL: usage_counters may be 0 or stale (row missing, drift from
    // deletions, or products created before feature gate was deployed).
    // Count actual non-deleted products + their variants and use the HIGHER
    // value to prevent limit bypass. Mirrors backend _reconcile_product_counter().
    // Each product counts as 1, each variant also counts as 1.
    // Example: 1 product with 2 variants = 3 items toward limit.
    if (featureKey === "create_product") {
      // Count non-deleted products
      const { count: productCount } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("user_id", firebaseUid)
        .neq("is_deleted", true);

      const pCount = productCount ?? 0;

      // Count variants belonging to non-deleted products
      let vCount = 0;
      if (pCount > 0) {
        const { data: productIds } = await supabase
          .from("products")
          .select("id")
          .eq("user_id", firebaseUid)
          .neq("is_deleted", true);

        if (productIds && productIds.length > 0) {
          const ids = productIds.map((p) => p.id);
          const { count: variantCount } = await supabase
            .from("product_variants")
            .select("id", { count: "exact", head: true })
            .in("product_id", ids);
          vCount = variantCount ?? 0;
        }
      }

      const actualCount = pCount + vCount;

      if (actualCount > used) {
        console.warn(
          `🔄 [FeatureCheck] Counter drift: counter=${used}, actual=${actualCount} (${pCount} products + ${vCount} variants) for ${firebaseUid}. Using actual.`,
        );
        used = actualCount;
      }
    }

    let hardLimit: number | null = null;
    let softLimit: number | null = null;
    let isUnlimited = false;

    const feature = planFeatures;

    // Track whether we found a plan_features row at all (even if limits are NULL).
    // A row with hard_limit=NULL + is_unlimited=false means "boolean feature, allowed".
    // No row at all means "feature not configured for this plan".
    let featureRowFound = false;

    if (feature) {
      featureRowFound = true;
      hardLimit = feature.hard_limit;
      softLimit = feature.soft_limit;
      isUnlimited = feature.is_unlimited;
    } else {
      // plan_features might not be seeded for this specific plan UUID
      // (monthly vs yearly have different UUIDs but same slug).
      // Fallback chain:
      //   1. Resolve plan_slug from pricing_plans by UUID
      //   2. If not found, derive slug from subscription.plan_name (e.g. "business")
      //   3. Find ANY plan with that slug + domain that has features seeded
      const resolvedDomain = subscriptionRaw.product_domain || domain;

      // Step 1: Try to get plan_slug from pricing_plans
      let planSlug: string | null = null;
      const { data: plan } = await supabase
        .from("pricing_plans")
        .select("plan_slug")
        .eq("id", subscription.pricing_plan_id)
        .limit(1)
        .maybeSingle();

      planSlug = plan?.plan_slug ?? null;

      // Step 2: If pricing_plans lookup failed, derive from subscription.plan_name
      // plan_name is typically the slug (e.g., "business", "pro", "starter")
      if (!planSlug && subscriptionRaw.plan_name) {
        planSlug = subscriptionRaw.plan_name.toLowerCase().trim();
        console.log(
          `🔄 [FeatureCheck] plan_id ${subscription.pricing_plan_id} not in pricing_plans. Derived slug="${planSlug}" from plan_name.`,
        );
      }

      if (planSlug) {
        // Find ALL plans with the same slug + domain (including the current one)
        const { data: candidatePlans } = await supabase
          .from("pricing_plans")
          .select("id")
          .eq("plan_slug", planSlug)
          .eq("product_domain", resolvedDomain)
          .eq("is_active", true);

        if (candidatePlans && candidatePlans.length > 0) {
          const candidateIds = candidatePlans.map((p) => p.id);

          // Find the feature from any of these candidate plans
          const { data: candidateFeature } = await supabase
            .from("plan_features")
            .select("hard_limit, soft_limit, is_unlimited")
            .in("plan_id", candidateIds)
            .eq("feature_key", featureKey)
            .limit(1)
            .maybeSingle();

          if (candidateFeature) {
            featureRowFound = true;
            console.log(
              `✅ [FeatureCheck] Resolved via sibling plan for slug "${planSlug}" (domain=${resolvedDomain})`,
            );
            hardLimit = candidateFeature.hard_limit;
            softLimit = candidateFeature.soft_limit;
            isUnlimited = candidateFeature.is_unlimited;
          }
        }
      }

      // If no plan_features row was found at all, deny.
      // A row with hard_limit=NULL + is_unlimited=false is a valid boolean
      // feature (e.g. advanced_analytics on Business plan) — it means
      // "allowed, no metered limit". We only deny when NO row exists.
      if (!featureRowFound) {
        console.error(
          `🚫 [FeatureCheck] No plan_features for plan_id ${subscription.pricing_plan_id}, feature ${featureKey}. ` +
            `plan_slug=${planSlug || "unknown"}, domain=${resolvedDomain}.`,
        );
        return NextResponse.json({
          allowed: false,
          hard_limit: 0,
          soft_limit: 0,
          is_unlimited: false,
          used,
          remaining: 0,
          denial_reason: "PLAN_FEATURES_MISSING",
          upgrade_required: false,
          feature_key: featureKey,
        });
      }
    }

    const allowed = isUnlimited || hardLimit === null || used < hardLimit;

    return NextResponse.json({
      allowed,
      hard_limit: hardLimit,
      soft_limit: softLimit,
      is_unlimited: isUnlimited,
      used,
      remaining: isUnlimited
        ? null
        : hardLimit !== null
          ? Math.max(0, hardLimit - used)
          : null,
      feature_key: featureKey,
    });
  } catch (error) {
    console.error("Error in GET /api/features/check:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
