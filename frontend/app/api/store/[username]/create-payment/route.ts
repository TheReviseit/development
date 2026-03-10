import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveSlugToUserId } from "@/lib/resolve-slug";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * POST /api/store/[username]/create-payment
 *
 * Creates a Razorpay Order server-side using the store owner's credentials.
 * Uses DIRECT HTTP fetch to Razorpay API (not the SDK) for maximum
 * reliability and control over the auth mechanism.
 *
 * Razorpay Orders API: https://razorpay.com/docs/api/orders/create
 * Auth: HTTP Basic (key_id:key_secret)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;

    if (!username) {
      return NextResponse.json(
        { success: false, error: "Store slug is required" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { amount, currency = "INR", receipt, notes } = body;

    // ── Validate amount ──────────────────────────────────────────────
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "Valid amount (in paise) is required" },
        { status: 400 },
      );
    }

    if (amount < 100) {
      return NextResponse.json(
        { success: false, error: "Minimum order amount is ₹1" },
        { status: 400 },
      );
    }

    // ── Resolve slug → user_id ───────────────────────────────────────
    const userId = await resolveSlugToUserId(username);

    if (!userId) {
      console.warn(
        `[create-payment] Could not resolve slug "${username}" to user_id`,
      );
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 },
      );
    }

    // ── Fetch store owner's Razorpay credentials ─────────────────────
    const supabase = getSupabase();
    const { data: business, error: dbError } = await supabase
      .from("businesses")
      .select(
        "razorpay_key_id, razorpay_key_secret, payments_enabled, business_name",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (dbError || !business) {
      console.error("[create-payment] Business lookup failed:", dbError);
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 },
      );
    }

    if (!business.payments_enabled) {
      return NextResponse.json(
        {
          success: false,
          error: "Online payments are not enabled for this store",
        },
        { status: 400 },
      );
    }

    if (!business.razorpay_key_id || !business.razorpay_key_secret) {
      console.error(
        `[create-payment] Missing Razorpay credentials for store "${username}"` +
          ` | key_id present: ${!!business.razorpay_key_id}` +
          ` | key_secret present: ${!!business.razorpay_key_secret}`,
      );
      return NextResponse.json(
        {
          success: false,
          error:
            "Payment gateway not configured. Please add Razorpay keys in Profile → Payment Gateway.",
        },
        { status: 400 },
      );
    }

    // Trim whitespace (stray spaces/newlines cause auth failures)
    const keyId = business.razorpay_key_id.trim();
    const keySecret = business.razorpay_key_secret.trim();

    console.log(
      `[create-payment] Creating order for store "${username}":` +
        ` | user_id: ${userId}` +
        ` | key_id: ${keyId.substring(0, 12)}...` +
        ` | key_secret length: ${keySecret.length}` +
        ` | key_id prefix: ${keyId.split("_").slice(0, 2).join("_")}` +
        ` | amount: ${amount} paise`,
    );

    // ── Create Razorpay Order via DIRECT HTTP ────────────────────────
    // Using fetch + Basic Auth instead of SDK to avoid SDK auth issues.
    // Razorpay API docs: POST https://api.razorpay.com/v1/orders
    const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    const orderPayload = {
      amount: Math.round(amount),
      currency,
      receipt: receipt || `store_${username}_${Date.now()}`,
      notes: {
        store: username,
        ...(notes || {}),
      },
    };

    const razorpayResponse = await fetch(
      "https://api.razorpay.com/v1/orders",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify(orderPayload),
      },
    );

    const razorpayData = await razorpayResponse.json();

    if (!razorpayResponse.ok) {
      console.error(
        `[create-payment] Razorpay API error (${razorpayResponse.status}):`,
        JSON.stringify(razorpayData),
      );

      // Specific error messages for common failures
      if (razorpayResponse.status === 401) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Razorpay authentication failed. Please verify your API keys in Profile → Payment Gateway. " +
              "Make sure you're using the correct Key ID and Key Secret pair from your Razorpay Dashboard.",
          },
          { status: 400 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: `Payment gateway error: ${razorpayData?.error?.description || "Unknown error"}`,
        },
        { status: 502 },
      );
    }

    console.log(
      `✅ [create-payment] Razorpay Order ${razorpayData.id} created for store "${username}" — ₹${(razorpayData.amount / 100).toFixed(2)}`,
    );

    return NextResponse.json({
      success: true,
      order_id: razorpayData.id,
      amount: razorpayData.amount,
      currency: razorpayData.currency,
      key_id: keyId,
      business_name: business.business_name || "Store",
    });
  } catch (error: any) {
    console.error("[create-payment] Unexpected error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create payment order" },
      { status: 500 },
    );
  }
}
