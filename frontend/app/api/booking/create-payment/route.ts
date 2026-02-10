import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Razorpay doesn't have proper ESM exports, use require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Razorpay = require("razorpay");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * POST /api/booking/create-payment
 * Create Razorpay order for showcase booking advance payment
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, currency = "INR", receipt, notes, user_id } = body;

    if (!amount) {
      return NextResponse.json(
        { success: false, error: "Amount is required" },
        { status: 400 },
      );
    }

    // Get user's Razorpay credentials from businesses table
    // user_id should be the slugId (business owner) for the showcase
    const userId = user_id || notes?.user_id;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "User ID is required" },
        { status: 400 },
      );
    }

    const { data: business } = await supabase
      .from("businesses")
      .select(
        "razorpay_key_id, razorpay_key_secret, payments_enabled, business_name",
      )
      .eq("user_id", userId)
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

    // Create Razorpay instance with business credentials
    const razorpay = new Razorpay({
      key_id: business.razorpay_key_id,
      key_secret: business.razorpay_key_secret,
    });

    // Create Razorpay order
    const order = await razorpay.orders.create({
      amount: Math.round(amount), // Already in paise from frontend
      currency,
      receipt: receipt || `showcase_${Date.now()}`,
      notes: notes || {},
    });

    return NextResponse.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: business.razorpay_key_id,
      business_name: business.business_name,
    });
  } catch (error) {
    console.error("[Showcase Payment API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create payment order" },
      { status: 500 },
    );
  }
}
