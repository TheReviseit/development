import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySessionCookieSafe } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * GET /api/features/usage
 *
 * Returns all usage counters + plan limits for the authenticated user.
 * Used by SoftLimitBanner to show "approaching limit" warnings.
 *
 * Response:
 *   { usage: [{ feature_key, used, hard_limit, soft_limit, is_unlimited,
 *               soft_limit_exceeded, hard_limit_exceeded }] }
 */
export async function GET() {
  try {
    // Auth check via session cookie
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
    const supabase = getSupabase();

    // Resolve Firebase UID → Supabase UUID
    const { data: userRow } = await supabase
      .from("users")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .limit(1)
      .maybeSingle();

    if (!userRow?.id) {
      return NextResponse.json({ usage: [], domain: "shop" });
    }

    const supabaseUserId = userRow.id;

    // Get active subscription
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("pricing_plan_id, plan_id, status, pending_plan_slug")
      .eq("user_id", supabaseUserId)
      .eq("product_domain", "shop")
      .in("status", [
        "active",
        "completed",
        "past_due",
        "grace_period",
        "trialing",
        "pending_upgrade",
      ])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub) {
      return NextResponse.json({ usage: [], domain: "shop" });
    }

    // Resolve pricing_plan_id
    let planId = sub.pricing_plan_id;
    if (!planId && sub.plan_id) {
      const { data: pp } = await supabase
        .from("pricing_plans")
        .select("id")
        .eq("razorpay_plan_id", sub.plan_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      planId = pp?.id ?? null;
    }

    // For pending_upgrade, use target plan's limits
    if (sub.status === "pending_upgrade" && sub.pending_plan_slug) {
      const { data: targetPlan } = await supabase
        .from("pricing_plans")
        .select("id")
        .eq("plan_slug", sub.pending_plan_slug)
        .eq("product_domain", "shop")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (targetPlan?.id) planId = targetPlan.id;
    }

    if (!planId) {
      return NextResponse.json({ usage: [], domain: "shop" });
    }

    // Get all plan features
    const { data: features } = await supabase
      .from("plan_features")
      .select("feature_key, hard_limit, soft_limit, is_unlimited")
      .eq("plan_id", planId);

    // Get all usage counters
    const { data: counters } = await supabase
      .from("usage_counters")
      .select("feature_key, current_value")
      .eq("user_id", supabaseUserId)
      .eq("domain", "shop");

    const counterMap = new Map(
      (counters ?? []).map((c) => [c.feature_key, c.current_value ?? 0]),
    );

    // Build usage array with limit comparisons
    const usage = (features ?? [])
      .filter((f) => f.hard_limit !== null && f.hard_limit > 0)
      .map((f) => {
        const used = counterMap.get(f.feature_key) ?? 0;
        const hardLimit = f.hard_limit!;
        const softLimit = f.soft_limit ?? Math.floor(hardLimit * 0.8);
        return {
          feature_key: f.feature_key,
          used,
          hard_limit: hardLimit,
          soft_limit: softLimit,
          is_unlimited: f.is_unlimited,
          soft_limit_exceeded: used >= softLimit,
          hard_limit_exceeded: used >= hardLimit,
        };
      });

    return NextResponse.json({ usage, domain: "shop" });
  } catch (error) {
    console.error("Error in GET /api/features/usage:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
