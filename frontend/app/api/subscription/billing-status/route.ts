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
  try {
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
      // Fail open: don't block dashboard if env is misconfigured
      return NextResponse.json({ locked: false, reason: null, status: null });
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
    // 4. Fetch latest subscription
    //    We check the `subscriptions` table (used by the billing monitor)
    //    to get the most accurate status after automatic expiry transitions.
    // ──────────────────────────────────────────────────────────────────────────
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("id, status, current_period_end, plan_name, product_domain")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // ──────────────────────────────────────────────────────────────────────────
    // 5. Determine lock state
    // ──────────────────────────────────────────────────────────────────────────

    // No subscription at all → show no_subscription lock
    if (!subscription) {
      return NextResponse.json({
        locked: true,
        reason: "no_subscription",
        status: null,
      });
    }

    const status = subscription.status as string;

    // Active states — dashboard fully accessible
    const ALLOWED_STATUSES = new Set([
      "active",
      "trialing",
      "trial",
      "grace_period",       // still in grace — allow access with banner
      "pending_upgrade",
      "upgrade_failed",
      "processing",
      "completed",          // Razorpay subscription completed (special case)
    ]);

    if (ALLOWED_STATUSES.has(status)) {
      // Extra safety: if status is "active" but period_end < now, treat as past_due
      if (status === "active" && subscription.current_period_end) {
        const periodEnd = new Date(subscription.current_period_end);
        if (periodEnd < new Date()) {
          return NextResponse.json({
            locked: true,
            reason: "past_due",
            status,
          });
        }
      }

      return NextResponse.json({ locked: false, reason: null, status });
    }

    // Map blocked statuses → lock reasons
    const LOCK_REASON_MAP: Record<string, string> = {
      suspended:  "suspended",
      past_due:   "past_due",
      halted:     "halted",
      cancelled:  "cancelled",
      expired:    "expired",
    };

    const reason = LOCK_REASON_MAP[status] ?? "unknown";

    return NextResponse.json({
      locked: true,
      reason,
      status,
    });

  } catch (error: any) {
    console.error("[BILLING_STATUS] Unhandled error:", error?.message || error);
    // FAIL OPEN on server error — don't randomly lock users out
    return NextResponse.json({
      locked: false,
      reason: null,
      status: null,
      error: "SERVER_ERROR",
    });
  }
}
