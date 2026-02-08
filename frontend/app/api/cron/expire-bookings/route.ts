import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// Booking Expiration Cron Job
// ============================================================
// Runs every minute to expire unpaid bookings past their reservation window.
// This releases slots for other customers when payments are abandoned.
// ============================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Verify cron request authenticity
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get("authorization");
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      console.error("[Expire Cron] Unauthorized request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date().toISOString();

    // Find and expire bookings that:
    // 1. Are in draft or payment_pending status
    // 2. Have payment_status that is NOT paid (to protect against webhook delays)
    // 3. Are past their reservation window
    const { data: expiredBookings, error } = await supabase
      .from("appointments")
      .update({
        booking_status: "expired",
        status: "cancelled", // Legacy field compatibility
        expired_at: now,
      })
      .in("booking_status", ["draft", "payment_pending"])
      .neq("payment_status", "paid") // Protect against webhook delays
      .lt("reserved_until", now)
      .select("id, customer_name, customer_phone, service, starts_at");

    if (error) {
      console.error("[Expire Cron] Database error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const expiredCount = expiredBookings?.length || 0;

    if (expiredCount > 0) {
      console.log(`[Expire Cron] Expired ${expiredCount} bookings:`);
      expiredBookings?.forEach((b) => {
        console.log(`  - ${b.id}: ${b.customer_name} at ${b.starts_at}`);
      });

      // Optional: Log to audit table for analytics
      await supabase.from("audit_logs").insert(
        expiredBookings?.map((b) => ({
          action: "booking_expired",
          details: {
            booking_id: b.id,
            customer_name: b.customer_name,
            service: b.service,
            starts_at: b.starts_at,
            reason: "payment_timeout",
          },
        })) || [],
      );
    } else {
      console.log("[Expire Cron] No bookings to expire");
    }

    return NextResponse.json({
      success: true,
      expired_count: expiredCount,
      checked_at: now,
    });
  } catch (error) {
    console.error("[Expire Cron] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
