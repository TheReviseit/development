import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// Razorpay doesn't have proper ESM exports, use require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Razorpay = require("razorpay");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================
// POST /api/booking/[bookingSlug]/payment
// Create Razorpay order for booking payment
// ============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingSlug: string }> },
) {
  try {
    const { bookingSlug } = await params;
    const body = await request.json();
    const { booking_id, amount } = body;

    if (!booking_id || !amount) {
      return NextResponse.json(
        { success: false, error: "Missing booking_id or amount" },
        { status: 400 },
      );
    }

    // Look up business
    const { data: business } = await supabase
      .from("businesses")
      .select(
        "user_id, business_name, razorpay_key_id, razorpay_key_secret, payments_enabled",
      )
      .or(`booking_slug.eq.${bookingSlug},user_id.eq.${bookingSlug}`)
      .maybeSingle();

    if (!business) {
      return NextResponse.json(
        { success: false, error: "Business not found" },
        { status: 404 },
      );
    }

    if (
      !business.payments_enabled ||
      !business.razorpay_key_id ||
      !business.razorpay_key_secret
    ) {
      return NextResponse.json(
        { success: false, error: "Payments not configured for this business" },
        { status: 400 },
      );
    }

    // Get booking details with status validation
    const { data: booking } = await supabase
      .from("appointments")
      .select(
        "id, service, customer_name, customer_email, customer_phone, service_price, booking_status, razorpay_order_id",
      )
      .eq("id", booking_id)
      .eq("user_id", business.user_id)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json(
        { success: false, error: "Booking not found" },
        { status: 404 },
      );
    }

    // ENTERPRISE FIX: Validate booking is in correct state
    if (booking.booking_status !== "draft") {
      // Idempotency: If already has an order, return it
      if (
        booking.razorpay_order_id &&
        booking.booking_status === "payment_pending"
      ) {
        return NextResponse.json({
          success: true,
          order: { id: booking.razorpay_order_id },
          key_id: business.razorpay_key_id,
          prefill: {
            name: booking.customer_name,
            email: booking.customer_email || "",
            contact: booking.customer_phone,
          },
          idempotent: true,
        });
      }
      return NextResponse.json(
        { success: false, error: "Booking already processed or expired" },
        { status: 400 },
      );
    }

    // Create Razorpay instance with business credentials
    const razorpay = new Razorpay({
      key_id: business.razorpay_key_id,
      key_secret: business.razorpay_key_secret,
    });

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Convert to paise
      currency: "INR",
      receipt: `bk_${booking_id.substring(0, 8)}`, // Max 40 chars, use shortened ID
      notes: {
        booking_id,
        service: booking.service,
        customer_name: booking.customer_name,
        business_id: business.user_id,
      },
    });

    // ENTERPRISE FIX: Update booking to payment_pending with amount for webhook verification
    await supabase
      .from("appointments")
      .update({
        razorpay_order_id: order.id,
        payment_status: "pending",
        booking_status: "payment_pending",
        payment_amount_paise: order.amount,
      })
      .eq("id", booking_id);

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      key_id: business.razorpay_key_id,
      prefill: {
        name: booking.customer_name,
        email: booking.customer_email || "",
        contact: booking.customer_phone,
      },
    });
  } catch (error) {
    console.error("[Booking Payment API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create payment order" },
      { status: 500 },
    );
  }
}

// ============================================================
// PUT /api/booking/[bookingSlug]/payment
// Verify Razorpay payment signature
// ============================================================
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ bookingSlug: string }> },
) {
  try {
    const { bookingSlug } = await params;
    const body = await request.json();
    const {
      booking_id,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = body;

    if (
      !booking_id ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return NextResponse.json(
        { success: false, error: "Missing payment verification data" },
        { status: 400 },
      );
    }

    // Look up business
    const { data: business } = await supabase
      .from("businesses")
      .select("user_id, razorpay_key_secret")
      .or(`booking_slug.eq.${bookingSlug},user_id.eq.${bookingSlug}`)
      .maybeSingle();

    if (!business) {
      return NextResponse.json(
        { success: false, error: "Business not found" },
        { status: 404 },
      );
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", business.razorpay_key_secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.error("[Booking Payment] Signature mismatch");
      return NextResponse.json(
        { success: false, error: "Payment verification failed" },
        { status: 400 },
      );
    }

    // ENTERPRISE FIX: Optimistic update only - webhook is source of truth
    // We store the payment_id for reference, but DO NOT confirm the booking here.
    // Only the webhook handler can transition to "confirmed" status.
    // This prevents frontend manipulation attacks.
    await supabase
      .from("appointments")
      .update({
        razorpay_payment_id,
        // payment_status stays "pending" until webhook confirms
        // booking_status stays "payment_pending" until webhook confirms
      })
      .eq("id", booking_id)
      .eq("user_id", business.user_id);

    // Return success for optimistic UI feedback
    // The booking is NOT confirmed yet - webhook will confirm
    return NextResponse.json({
      success: true,
      message: "Payment recorded. Awaiting confirmation...",
      status: "pending_webhook",
    });
  } catch (error) {
    console.error("[Booking Payment Verify] Error:", error);
    return NextResponse.json(
      { success: false, error: "Payment verification failed" },
      { status: 500 },
    );
  }
}
