import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/subscription/check-domain?domain=shop
 *
 * Checks if the authenticated user has an active subscription/membership
 * for a given product domain. Used by SubscriptionGate component to
 * block access to product-specific dashboard pages.
 *
 * Returns:
 *   - hasAccess: boolean
 *   - membership: { status, product, trial_ends_at } | null
 *   - subscription: { plan_slug, status } | null
 */
export async function GET(request: NextRequest) {
  try {
    // ========================================================================
    // 1. AUTHENTICATION
    // ========================================================================

    const sessionCookie = request.cookies.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json(
        { hasAccess: false, reason: "NOT_AUTHENTICATED" },
        { status: 401 },
      );
    }

    let firebaseUid: string;
    try {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie);
      firebaseUid = decoded.uid;
    } catch {
      return NextResponse.json(
        { hasAccess: false, reason: "INVALID_SESSION" },
        { status: 401 },
      );
    }

    // ========================================================================
    // 2. VALIDATE DOMAIN PARAMETER
    // ========================================================================

    const domain = request.nextUrl.searchParams.get("domain");
    const validDomains = ["shop", "showcase", "marketing", "api", "dashboard", "booking"];

    if (!domain || !validDomains.includes(domain)) {
      return NextResponse.json(
        { hasAccess: false, reason: "INVALID_DOMAIN" },
        { status: 400 },
      );
    }

    // Dashboard is always accessible (free tier)
    if (domain === "dashboard") {
      return NextResponse.json({ hasAccess: true, reason: "FREE_TIER" });
    }

    // ========================================================================
    // 3. INITIALIZE SUPABASE
    // ========================================================================

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { hasAccess: false, reason: "SERVER_ERROR" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ========================================================================
    // 4. GET USER
    // ========================================================================

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .single();

    if (!user) {
      return NextResponse.json(
        { hasAccess: false, reason: "USER_NOT_FOUND" },
        { status: 404 },
      );
    }

    // ========================================================================
    // 5. CHECK PRODUCT MEMBERSHIP (user_products table)
    // ========================================================================

    const { data: membership } = await supabase
      .from("user_products")
      .select("id, product, status, trial_ends_at, created_at")
      .eq("user_id", user.id)
      .eq("product", domain)
      .maybeSingle();

    const now = new Date();
    const membershipStatus = membership?.status as string | undefined;
    const hasActiveMembership = membershipStatus === "active";
    const hasValidTrialMembership =
      membershipStatus === "trial" &&
      !!membership?.trial_ends_at &&
      new Date(membership.trial_ends_at) > now;

    const hasMembership = hasActiveMembership || hasValidTrialMembership;

    // ========================================================================
    // 6. CHECK SUBSCRIPTION (subscriptions table)
    // ========================================================================

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select(
        "id, status, product_domain, plan_id, pricing_plan_id, current_period_end, created_at",
      )
      .eq("user_id", user.id)
      .eq("product_domain", domain)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get plan details if subscription exists
    let planSlug: string | null = null;
    if (subscription?.pricing_plan_id) {
      const { data: plan } = await supabase
        .from("pricing_plans")
        .select("plan_slug")
        .eq("id", subscription.pricing_plan_id)
        .single();
      planSlug = plan?.plan_slug || null;
    }

    const subscriptionStatus = (subscription?.status as string | undefined)?.toLowerCase();
    const allowedSubscriptionStatuses = new Set([
      "active",
      "completed",
      "trialing",
      "trial",
      "grace_period",
      "pending_upgrade",
      "upgrade_failed",
    ]);

    let hasSubscription = false;
    if (subscriptionStatus && allowedSubscriptionStatuses.has(subscriptionStatus)) {
      if (subscriptionStatus === "active" && subscription?.current_period_end) {
        const periodEnd = new Date(subscription.current_period_end);
        hasSubscription = periodEnd > now;
      } else {
        hasSubscription = true;
      }
    }

    // ========================================================================
    // 7. CHECK PRODUCT SUBSCRIPTIONS (product_subscriptions table — NEW)
    // ========================================================================

    const { data: productSub } = await supabase
      .from("product_subscriptions")
      .select("id, product_domain, status")
      .eq("user_id", user.id)
      .eq("product_domain", domain)
      .in("status", ["active", "trial"])
      .maybeSingle();

    const hasProductSub = !!productSub;

    // ===================================================================
    // 8. CHECK ACTIVE TRIAL (free_trials table)
    // ===================================================================
    const { data: trial } = await supabase
      .from("free_trials")
      .select("id, status, plan_slug, domain, expires_at")
      .eq("user_id", user.id)
      .eq("domain", domain)
      .in("status", ["active", "expiring_soon"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasTrial = !!trial;

    // ========================================================================
    // 9. DETERMINE ACCESS
    // ========================================================================

    // User has access if they have ANY of:
    // 1. Active product membership (trial or active) — user_products table
    // 2. Active subscription for this domain — subscriptions table
    // 3. Active product subscription — product_subscriptions table (new)
    // 4. Active free trial — free_trials table (NEW)
    const hasAccess = hasMembership || hasSubscription || hasProductSub || hasTrial;

    console.log(`[CHECK_DOMAIN] User ${user.id} access check:`, {
      domain,
      hasMembership,
      hasSubscription,
      hasProductSub,
      hasTrial,
      hasAccess,
      trialPlan: trial?.plan_slug,
    });

    return NextResponse.json({
      hasAccess,
      reason: hasAccess
        ? hasMembership
          ? "MEMBERSHIP_ACTIVE"
          : hasTrial
            ? "TRIAL_ACTIVE"
            : "SUBSCRIPTION_ACTIVE"
        : "NO_ACCESS",
      membership:
        hasMembership && membership
          ? {
              status: membership.status,
              product: membership.product,
              trialEndsAt: membership.trial_ends_at,
            }
          : null,
      subscription:
        hasSubscription && subscription
          ? {
              status: subscription.status,
              planSlug,
            }
          : null,
      trial: hasTrial
        ? {
            status: trial.status,
            planSlug: trial.plan_slug,
            expiresAt: trial.expires_at,
          }
        : null,
      domain,
    });
  } catch (error: any) {
    console.error(
      "[SUBSCRIPTION_CHECK] Unhandled error:",
      error?.message || error,
    );
    return NextResponse.json(
      { hasAccess: false, reason: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}
