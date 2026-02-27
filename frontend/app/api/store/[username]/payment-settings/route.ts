import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveSlugToUserId } from "@/lib/resolve-slug";

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;

    if (!username) {
      return NextResponse.json(
        { error: "Store slug is required" },
        { status: 400 },
      );
    }

    // ── RESOLVE SLUG → USER_ID ────────────────────────────────────────
    // username is the URL slug (e.g., "a1b2c3d4" or "rajas-boutique"),
    // NOT the Firebase UID. We must resolve it first.
    const userId = await resolveSlugToUserId(username);

    if (!userId) {
      console.warn(
        `[payment-settings] Could not resolve slug "${username}" to user_id`,
      );
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const supabase = getSupabase();

    // Get business by resolved user_id
    const { data, error } = await supabase
      .from("businesses")
      .select(
        "razorpay_key_id, payments_enabled, business_name, ecommerce_policies",
      )
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // ── Check if store owner's plan still has email_invoices quota ──────
    // Used by checkout page to show/hide "I want invoice" checkbox.
    // Fail-open: if check fails, default to showing the option.
    let invoiceEnabled = true;
    try {
      // Resolve Firebase UID → Supabase UUID
      const { data: userRow } = await supabase
        .from("users")
        .select("id")
        .eq("firebase_uid", userId)
        .limit(1)
        .maybeSingle();

      if (userRow?.id) {
        // Get active shop subscription
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("pricing_plan_id")
          .eq("user_id", userRow.id)
          .eq("product_domain", "shop")
          .in("status", [
            "active",
            "completed",
            "past_due",
            "trialing",
            "trial",
          ])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sub?.pricing_plan_id) {
          const { data: planFeature } = await supabase
            .from("plan_features")
            .select("hard_limit, is_unlimited")
            .eq("plan_id", sub.pricing_plan_id)
            .eq("feature_key", "email_invoices")
            .limit(1)
            .maybeSingle();

          if (planFeature) {
            if (planFeature.is_unlimited) {
              invoiceEnabled = true;
            } else if (
              planFeature.hard_limit !== null &&
              planFeature.hard_limit <= 0
            ) {
              // Explicitly denied
              invoiceEnabled = false;
            } else if (planFeature.hard_limit !== null) {
              // Metered — check current usage
              const { data: counter } = await supabase
                .from("usage_counters")
                .select("current_value")
                .eq("user_id", userRow.id)
                .eq("domain", "shop")
                .eq("feature_key", "email_invoices")
                .maybeSingle();

              const used = counter?.current_value ?? 0;
              invoiceEnabled = used < planFeature.hard_limit;
            }
            // hard_limit === null and not unlimited → boolean granted
          }
          // planFeature not found → fail-open, keep true
        }
        // No subscription → fail-open, keep true
      }
    } catch (err) {
      // Fail-open: if check fails, show the invoice option
      console.warn("[payment-settings] Invoice feature check failed:", err);
    }

    // Only return public key (NOT the secret!)
    return NextResponse.json({
      success: true,
      paymentsEnabled: data.payments_enabled || false,
      razorpayKeyId: data.razorpay_key_id || null, // Public key only
      storeName: data.business_name || "Store",
      storeUserId: userId, // ✅ Return resolved user_id for downstream API calls
      invoiceEnabled, // ✅ Whether email_invoices quota is available
      shippingCharges:
        data.ecommerce_policies?.shipping_charges ||
        data.ecommerce_policies?.shippingCharges ||
        null,
      codAvailable:
        data.ecommerce_policies?.cod_available ??
        data.ecommerce_policies?.codAvailable ??
        false,
    });
  } catch (error) {
    console.error("Error fetching store payment settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment settings" },
      { status: 500 },
    );
  }
}
