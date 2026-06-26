import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/subscription/billing-status
 *
 * Returns the billing status for the authenticated user.
 * Used exclusively by the BillingLockScreen to gate the entire dashboard.
 *
 * Returns:
 *   { locked: boolean, reason: BillingLockReason, status: string | null }
 *
 * Lock reasons:
 *   "suspended"       — subscription.status = 'suspended'
 *   "past_due"        — subscription.status = 'past_due'
 *   "halted"          — subscription.status = 'halted'
 *   "cancelled"       — subscription.status = 'cancelled'
 *   "expired"         — subscription.status = 'expired'
 *   "no_subscription" — no subscription row found
 *   null              — access allowed (active / trialing / grace_period etc.)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  try {
    console.log("[BILLING_STATUS] API called");
    
    // ──────────────────────────────────────────────────────────────────────────
    // 1. Authenticate
    // ──────────────────────────────────────────────────────────────────────────
    const sessionCookie = request.cookies.get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json(
        { locked: false, reason: null, status: null, error: "NOT_AUTHENTICATED" },
        { status: 401 },
      );
    }

    let firebaseUid: string;
    try {
      const decoded = await adminAuth.verifySessionCookie(sessionCookie);
      firebaseUid = decoded.uid;
    } catch {
      return NextResponse.json(
        { locked: false, reason: null, status: null, error: "INVALID_SESSION" },
        { status: 401 },
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Initialize Supabase
    // ──────────────────────────────────────────────────────────────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      // Fail closed: if we can't verify billing, do not allow a bypass.
      return NextResponse.json({
        locked: true,
        reason: "unknown",
        status: null,
        error: "SERVER_MISCONFIG",
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Resolve user
    // ──────────────────────────────────────────────────────────────────────────
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .single();

    if (!user) {
      // No DB record yet (fresh signup) — don't block
      return NextResponse.json({ locked: false, reason: null, status: null });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. Fetch latest subscription and trial in PARALLEL
    // ──────────────────────────────────────────────────────────────────────────
    const domain = request.headers.get("x-product-domain") || "dashboard";
    
    const ALLOWED_SUB_STATUSES = [
      "active",
      "trialing",
      "trial",
      "grace_period",
      "pending_upgrade",
      "upgrade_failed",
      "completed",
    ];
    const WARN_SUB_STATUSES = ["past_due"];
    const BLOCKED_SUB_STATUSES = [
      "suspended",
      "halted",
      "cancelled",
      "expired",
      "paused",
      "pending",
      "created",
      "processing",
      "failed",
    ];

    const [
      { data: entitledSub },
      { data: blockedSub },
      { data: membership },
      { data: trialRecord },
    ] = await Promise.all([
      // Prefer an entitled/warned subscription if it exists (domain-scoped).
      supabase
        .from("subscriptions")
        .select(
          "id, status, current_period_end, plan_name, product_domain, pricing_plan_id, pricing_plans(plan_slug, display_name)",
        )
        .eq("user_id", user.id)
        .eq("product_domain", domain)
        .in("status", [...ALLOWED_SUB_STATUSES, ...WARN_SUB_STATUSES])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select(
          "id, status, current_period_end, plan_name, product_domain, pricing_plan_id, pricing_plans(plan_slug, display_name)",
        )
        .eq("user_id", user.id)
        .eq("product_domain", domain)
        .in("status", BLOCKED_SUB_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Canonical product membership written by auth sync / product activation.
      supabase
        .from("user_products")
        .select("id, status, product, trial_ends_at, activated_at")
        .eq("user_id", user.id)
        .eq("product", domain)
        .maybeSingle(),
      // Trials are domain-specific.
      supabase
        .from("free_trials")
        .select("id, status, expires_at, plan_slug, domain, started_at")
        .in("user_id", Array.from(new Set([user.id, firebaseUid])))
        .eq("domain", domain)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const subscription = entitledSub ?? blockedSub;

    const resolvePlanFields = (sub: typeof subscription) => {
      if (!sub) return { plan_name: null as string | null, plan_tier: number | null };
      const joinedRaw = (sub as { pricing_plans?: { plan_slug?: string } | { plan_slug?: string }[] | null })
        .pricing_plans;
      const joined = Array.isArray(joinedRaw) ? joinedRaw[0] : joinedRaw;
      const slug = joined?.plan_slug || sub.plan_name || null;
      let plan_tier: number | null = null;
      if (slug) {
        const short = slug.replace(new RegExp(`^${domain}_`), "").toLowerCase();
        if (short === "pro" || short === "professional" || slug.toLowerCase().endsWith("_pro")) {
          plan_tier = 2;
        } else if (short === "business" || short === "growth") {
          plan_tier = 1;
        } else if (short === "starter" || short === "free") {
          plan_tier = 0;
        }
      }
      return { plan_name: slug, plan_tier };
    };

    const enrichPlanFields = async (sub: typeof subscription) => {
      let fields = resolvePlanFields(sub);
      if (fields.plan_name) return fields;

      if (sub?.pricing_plan_id) {
        const { data: planRow } = await supabase
          .from("pricing_plans")
          .select("plan_slug")
          .eq("id", sub.pricing_plan_id)
          .maybeSingle();
        if (planRow?.plan_slug) {
          fields = resolvePlanFields({
            ...sub,
            plan_name: planRow.plan_slug,
            pricing_plans: planRow,
          } as typeof sub);
          if (fields.plan_name) return fields;
        }
      }

      const { data: fallbackSub } = await supabase
        .from("subscriptions")
        .select(
          "plan_name, pricing_plan_id, product_domain, pricing_plans(plan_slug)",
        )
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return resolvePlanFields(fallbackSub);
    };
    // Parse trial state
    let trial = null;
    let expiredTrial = null;
    
    if (trialRecord) {
      const isExpired = trialRecord.status === 'expired' || new Date(trialRecord.expires_at) < new Date();
      if (!isExpired && (trialRecord.status === 'active' || trialRecord.status === 'expiring_soon')) {
        trial = trialRecord;
      } else {
        expiredTrial = trialRecord;
      }
    }
    
    const membershipStatus = (membership?.status as string | undefined)?.toLowerCase();
    const membershipTrialEndsAt = membership?.trial_ends_at
      ? new Date(membership.trial_ends_at)
      : null;
    const membershipTrialActive =
      membershipStatus === "trial" &&
      (!membershipTrialEndsAt || membershipTrialEndsAt > new Date());
    const membershipTrialExpired =
      membershipStatus === "trial" &&
      !!membershipTrialEndsAt &&
      membershipTrialEndsAt <= new Date();

    console.log(`[BILLING_STATUS] User ${user.id} on domain ${domain}: subscription=${subscription ? subscription.status : 'none'}, membership=${membershipStatus || 'none'}, trial=${trial ? trial.status : (expiredTrial ? 'expired' : 'none')}`);

    // ──────────────────────────────────────────────────────────────────────────
    // 5. Determine lock state
    // ──────────────────────────────────────────────────────────────────────────
    //
    // PRIORITY ORDER (critical — do NOT rearrange):
    //   1. Active trial → unlock
    //   2. Active subscription → unlock  (MUST come before expired trial check)
    //   3. Expired trial → lock
    //   4. No subscription at all → lock
    //   5. Blocked subscription status → lock
    //

    // ── PRIORITY 1: Active trial → unlock ────────────────────────────────────
    if (trial) {
      console.log(`[BILLING_STATUS] User ${user.id} has active trial, granting access`);
      return NextResponse.json({
        locked: false,
        reason: null,
        status: "trial",
        trial: {
          id: trial.id,
          status: trial.status,
          expires_at: trial.expires_at,
          started_at: trial.started_at,
          plan: trial.plan_slug,
        },
      });
    }

    if (membership && (membershipStatus === "active" || membershipTrialActive)) {
      const status = membershipStatus === "active" ? "active" : "trial";
      const planFields = await enrichPlanFields(subscription);
      console.log(`[BILLING_STATUS] User ${user.id} has active user_products membership (${status}), granting access`);
      return NextResponse.json({
        locked: false,
        reason: null,
        status,
        plan_name: planFields.plan_name,
        plan_tier: planFields.plan_tier,
        trial: membershipTrialActive
          ? {
              id: membership.id,
              status: "active",
              expires_at: membership.trial_ends_at,
              started_at: membership.activated_at,
              plan: `${domain}_starter`,
              source: "user_products",
            }
          : undefined,
      });
    }

    // ── PRIORITY 2: Active subscription → unlock ─────────────────────────────
    // CRITICAL: This MUST run BEFORE the expired trial check.
    // A user who had a trial, let it expire, then paid for a subscription
    // still has the expired trial row in the DB. Without this check,
    // the expired trial would lock them out even though they're paying.
    if (subscription) {
      const subStatus = subscription.status as string;

      const ALLOWED_STATUSES = new Set([
        "active",
        "trialing",
        "trial",
        "grace_period",
        "pending_upgrade",
        "upgrade_failed",
        "completed",
      ]);

      if (ALLOWED_STATUSES.has(subStatus)) {
        // Extra safety: if status is "active" but period_end < now, treat as past_due
        if (subStatus === "active" && subscription.current_period_end) {
          const periodEnd = new Date(subscription.current_period_end);
          if (periodEnd < new Date()) {
            return NextResponse.json({
              locked: true,
              reason: "past_due",
              status: subStatus,
            });
          }
        }

        console.log(`[BILLING_STATUS] User ${user.id} has active subscription (${subStatus}), granting access`);
        const planFields = await enrichPlanFields(subscription);
        return NextResponse.json({
          locked: false,
          reason: null,
          status: subStatus,
          plan_name: planFields.plan_name,
          plan_tier: planFields.plan_tier,
        });
      }

      // Subscription exists but is in a blocked state — map to lock reason
      const LOCK_REASON_MAP: Record<string, string> = {
        suspended:  "suspended",
        past_due:   "past_due",
        halted:     "halted",
        cancelled:  "cancelled",
        expired:    "expired",
        paused:     "suspended",
        // Non-entitled / unpaid / pre-billing states should behave like "no plan selected"
        pending:    "no_subscription",
        created:    "no_subscription",
        processing: "no_subscription",
        failed:     "no_subscription",
      };

      const reason = LOCK_REASON_MAP[subStatus] ?? "unknown";
      return NextResponse.json({ locked: true, reason, status: subStatus });
    }

    // ── PRIORITY 3: Expired trial (no active subscription) → lock ────────────
    if (expiredTrial || (membership && membershipTrialExpired)) {
      const durationMs = Date.now() - startTime;
      console.info(`[BILLING_STATUS] trial_expired user=${user.id.slice(0, 8)} duration=${durationMs}ms`);
      console.log(`[BILLING_STATUS] User ${user.id} has EXPIRED trial (no active subscription), showing expired lock`);
      return NextResponse.json({
        locked: true,
        reason: "trial_expired",
        status: "expired",
        trial: {
          id: expiredTrial?.id || membership?.id,
          status: "expired",
          expires_at: expiredTrial?.expires_at || membership?.trial_ends_at,
          started_at: expiredTrial?.started_at || membership?.activated_at,
          plan: expiredTrial?.plan_slug || `${domain}_starter`,
        },
        _meta: {
          durationMs,
          event: "trial_expired",
        },
      });
    }

    // ── PRIORITY 4: No subscription AND no trial → lock ──────────────────────
    return NextResponse.json({
      locked: true,
      reason: "no_subscription",
      status: null,
    });

  } catch (error: any) {
    console.error("[BILLING_STATUS] Unhandled error:", error?.message || error);
    const durationMs = Date.now() - startTime;
    console.error(`[BILLING_STATUS] error duration=${durationMs}ms`);
    // FAIL OPEN on server error — don't randomly lock users out
    return NextResponse.json({
      locked: true,
      reason: "unknown",
      status: null,
      error: "SERVER_ERROR",
    });
  }
}
