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
      { data: trialRecord },
    ] = await Promise.all([
      // Prefer an entitled/warned subscription if it exists (domain-agnostic).
      supabase
        .from("subscriptions")
        .select("id, status, current_period_end, plan_name, product_domain")
        .eq("user_id", user.id)
        .in("status", [...ALLOWED_SUB_STATUSES, ...WARN_SUB_STATUSES])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Otherwise, pick a blocked subscription for a specific lock reason.
      supabase
        .from("subscriptions")
        .select("id, status, current_period_end, plan_name, product_domain")
        .eq("user_id", user.id)
        .in("status", BLOCKED_SUB_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Trials are domain-specific.
      supabase
        .from("free_trials")
        .select("id, status, expires_at, plan_slug, domain, started_at")
        .eq("user_id", user.id)
        .eq("domain", domain)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const subscription = entitledSub ?? blockedSub;
    
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
    
    console.log(`[BILLING_STATUS] User ${user.id} on domain ${domain}: subscription=${subscription ? subscription.status : 'none'}, trial=${trial ? trial.status : (expiredTrial ? 'expired' : 'none')}`);

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
        }
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
        return NextResponse.json({ locked: false, reason: null, status: subStatus });
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
    if (expiredTrial) {
      const durationMs = Date.now() - startTime;
      console.info(`[BILLING_STATUS] trial_expired user=${user.id.slice(0, 8)} duration=${durationMs}ms`);
      console.log(`[BILLING_STATUS] User ${user.id} has EXPIRED trial (no active subscription), showing expired lock`);
      return NextResponse.json({
        locked: true,
        reason: "trial_expired",
        status: "expired",
        trial: {
          id: expiredTrial.id,
          status: "expired",
          expires_at: expiredTrial.expires_at,
          started_at: expiredTrial.started_at,
          plan: expiredTrial.plan_slug,
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
