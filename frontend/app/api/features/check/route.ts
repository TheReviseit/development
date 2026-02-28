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

    // ── Resolve Firebase UID → Supabase UUID ──────────────────────────
    // Subscriptions and usage_counters use Supabase UUID.
    const { data: userRow } = await supabase
      .from("users")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .limit(1)
      .maybeSingle();

    const supabaseUserId = userRow?.id; // UUID for subscriptions + usage_counters

    // 1. Get user's active subscription for shop domain
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

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("pricing_plan_id")
      .eq("user_id", supabaseUserId)
      .eq("product_domain", "shop")
      .in("status", [
        "active",
        "completed",
        "past_due",
        "grace_period",
        "trialing",
        "trial",
        "processing",
        "pending_upgrade",
        "upgrade_failed",
      ])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription?.pricing_plan_id) {
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
      .eq("domain", "shop")
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

    if (feature) {
      hardLimit = feature.hard_limit;
      softLimit = feature.soft_limit;
      isUnlimited = feature.is_unlimited;
    } else {
      // plan_features might not be seeded for this specific plan UUID
      // (monthly vs yearly have different UUIDs but same slug).
      // Fallback: resolve plan_slug and find features from a sibling plan.
      const { data: plan } = await supabase
        .from("pricing_plans")
        .select("plan_slug")
        .eq("id", subscription.pricing_plan_id)
        .limit(1)
        .maybeSingle();

      if (plan?.plan_slug) {
        // Find any plan with the same slug that HAS features seeded
        const { data: siblingPlan } = await supabase
          .from("pricing_plans")
          .select("id")
          .eq("plan_slug", plan.plan_slug)
          .eq("product_domain", "shop")
          .eq("is_active", true)
          .neq("id", subscription.pricing_plan_id)
          .limit(1)
          .maybeSingle();

        if (siblingPlan) {
          const { data: siblingFeature } = await supabase
            .from("plan_features")
            .select("hard_limit, soft_limit, is_unlimited")
            .eq("plan_id", siblingPlan.id)
            .eq("feature_key", featureKey)
            .limit(1)
            .maybeSingle();

          if (siblingFeature) {
            console.log(
              `✅ [FeatureCheck] Resolved via sibling plan ${siblingPlan.id} for slug ${plan.plan_slug}`,
            );
            hardLimit = siblingFeature.hard_limit;
            softLimit = siblingFeature.soft_limit;
            isUnlimited = siblingFeature.is_unlimited;
          }
        }
      }

      // If still no feature data after fallback, deny
      if (hardLimit === null && !isUnlimited && softLimit === null) {
        console.error(
          `🚫 [FeatureCheck] No plan_features for plan_id ${subscription.pricing_plan_id}, feature ${featureKey}.`,
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
