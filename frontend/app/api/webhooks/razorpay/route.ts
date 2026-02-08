import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ============================================================
// Razorpay Webhook Handler - Source of Truth for Payments
// ============================================================
// This is the ONLY place where bookings are confirmed after payment.
// Frontend verification is optimistic-only; webhook is authoritative.
// ============================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Razorpay webhook secret (set in Razorpay Dashboard > Webhooks)
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  try {
    // Read raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    if (!signature) {
      console.error("[Razorpay Webhook] Missing signature header");
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    if (!WEBHOOK_SECRET) {
      console.error(
        "[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET not configured",
      );
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 },
      );
    }

    // Verify webhook signature using HMAC-SHA256
    const expectedSignature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.error("[Razorpay Webhook] Signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(body);
    const eventId = event.id;
    const eventType = event.event;

    console.log(`[Razorpay Webhook] Received: ${eventType}, ID: ${eventId}`);

    // Check for replay attack - store processed event IDs
    const { data: existingEvent } = await supabase
      .from("webhook_events")
      .select("id")
      .eq("id", eventId)
      .maybeSingle();

    if (existingEvent) {
      console.log(`[Razorpay Webhook] Duplicate event ${eventId}, skipping`);
      return NextResponse.json({ received: true, replay: true });
    }

    // Store event ID BEFORE processing to prevent race conditions
    await supabase.from("webhook_events").insert({
      id: eventId,
      event_type: eventType,
      payload: event,
      processed_at: new Date().toISOString(),
    });

    // Extract order ID from payment entity
    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id;

    if (!orderId) {
      console.warn(`[Razorpay Webhook] No order_id in event ${eventId}`);
      return NextResponse.json({ received: true, no_order: true });
    }

    // Find booking by Razorpay order ID
    const { data: booking, error: bookingError } = await supabase
      .from("appointments")
      .select("id, booking_status, payment_amount_paise, user_id")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();

    if (bookingError || !booking) {
      console.error(`[Razorpay Webhook] No booking for order ${orderId}`);
      return NextResponse.json({ received: true, booking_not_found: true });
    }

    // Idempotency: Skip if already processed
    if (
      booking.booking_status === "confirmed" ||
      booking.booking_status === "failed"
    ) {
      console.log(
        `[Razorpay Webhook] Booking ${booking.id} already ${booking.booking_status}`,
      );
      return NextResponse.json({ received: true, idempotent: true });
    }

    // Handle different event types
    switch (eventType) {
      case "payment.captured": {
        // SECURITY: Verify payment amount matches booking amount
        if (
          booking.payment_amount_paise &&
          payment.amount !== booking.payment_amount_paise
        ) {
          console.error(
            `[Razorpay Webhook] Amount mismatch! Expected: ${booking.payment_amount_paise}, Got: ${payment.amount}`,
          );
          // Log potential fraud attempt but still process (amount already paid)
          await supabase.from("audit_logs").insert({
            user_id: booking.user_id,
            action: "payment_amount_mismatch",
            details: {
              booking_id: booking.id,
              expected: booking.payment_amount_paise,
              received: payment.amount,
              order_id: orderId,
            },
          });
        }

        // CONFIRM THE BOOKING - This is the source of truth
        const { error: updateError } = await supabase
          .from("appointments")
          .update({
            booking_status: "confirmed",
            status: "confirmed", // Legacy field compatibility
            payment_status: "paid",
            razorpay_payment_id: payment.id,
            razorpay_webhook_verified: true,
            payment_verified_at: new Date().toISOString(),
            paid_at: new Date().toISOString(),
          })
          .eq("id", booking.id);

        if (updateError) {
          console.error(
            `[Razorpay Webhook] Failed to confirm booking ${booking.id}:`,
            updateError,
          );
          return NextResponse.json(
            { error: "Failed to update booking" },
            { status: 500 },
          );
        }

        console.log(
          `[Razorpay Webhook] ✅ Booking ${booking.id} CONFIRMED via webhook`,
        );
        break;
      }

      case "payment.failed": {
        await supabase
          .from("appointments")
          .update({
            booking_status: "failed",
            payment_status: "failed",
          })
          .eq("id", booking.id);

        console.log(
          `[Razorpay Webhook] ❌ Booking ${booking.id} marked FAILED`,
        );
        break;
      }

      case "order.paid": {
        // Alternative confirmation path - some integrations use this
        if (booking.booking_status !== "confirmed") {
          await supabase
            .from("appointments")
            .update({
              booking_status: "confirmed",
              status: "confirmed",
              payment_status: "paid",
              razorpay_webhook_verified: true,
              payment_verified_at: new Date().toISOString(),
              paid_at: new Date().toISOString(),
            })
            .eq("id", booking.id);

          console.log(
            `[Razorpay Webhook] ✅ Booking ${booking.id} CONFIRMED via order.paid`,
          );
        }
        break;
      }

      case "refund.processed": {
        const refund = event.payload?.refund?.entity;
        await supabase
          .from("appointments")
          .update({
            booking_status: "refunded",
            payment_status: "refunded",
            refund_id: refund?.id,
            refunded_at: new Date().toISOString(),
          })
          .eq("id", booking.id);

        console.log(`[Razorpay Webhook] 💰 Booking ${booking.id} REFUNDED`);
        break;
      }

      default:
        console.log(`[Razorpay Webhook] Unhandled event type: ${eventType}`);
    }

    return NextResponse.json({ received: true, processed: eventType });
  } catch (error) {
    console.error("[Razorpay Webhook] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
